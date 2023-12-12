import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './SheetMusic.css';

import * as pdfjs from 'pdfjs-dist'
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

// The model for measure detection was trained with images around 600px 
// in width. To ensure consistency with the training data, images sent to
// the server are scaled to a width close to 600px, enhancing detection
// accuracy.
const SERVER_IMAGE_WIDTH = 600;

class SheetMusic extends Component {
    // Define prop types for component validation.
    static propTypes = {
        uploadedFile    : PropTypes.object,
        fileUrl         : PropTypes.string,
        onMeasureClick  : PropTypes.func,
        beatsPerMeasure : PropTypes.number,
        bpm             : PropTypes.number,
        transitionEnd   : PropTypes.number,
        transitionStart : PropTypes.number,
    };

    // Default props in case they are not provided.
    static defaultProps = {
        uploadedFile    : null,
        fileUrl         : null,
        onMeasureClick  : () => {},
        beatsPerMeasure : 4,
        bpm             : 60,
        transitionEnd   : 1,
        transitionStart : 0,
    };

    constructor(props) {
        super(props);
        this.state = {
            pageImages           : [],        // Stores the rendered images of each PDF page.
            measureRects         : [],        // Stores the dimensions of musical measures.
            measureClicked       : null,      // Tracks the last measure clicked by the user.
            currentHiddenMeasure : null,      // Tracks the currently hidden musical measure.
            analyzingPages       : new Set(), // Set of pages currently under analysis.
        }; 

        // Initialize an array of refs, one for each page.
        this.pageRefs = [];
    }

    componentDidMount() {
        // Convert uploaded files or files from URL to PNG upon mounting.
        if (this.props.uploadedFile) {
            this.convertPdfToPng(this.props.uploadedFile)
                .then()
                .catch(error => console.error("Error converting PDF to PNG: ", error));
        } else if (this.props.fileUrl) {
            this.convertPdfUrlToPng(this.props.fileUrl)
                .then()
                .catch(error => console.error("Error fetching and converting PDF: ", error));
        }
    }

    // Converts a PDF file to a PNG format.
    convertPdfToPng(file) {
        const fileReader = new FileReader();

        return new Promise((resolve, reject) => {
            fileReader.onload = async (event) => {
                const arrayBuffer = event.target.result;
                try {
                    const loadingTask = pdfjs.getDocument({ data: arrayBuffer, verbosity: pdfjs.VerbosityLevel.ERRORS });
                    const pdf = await loadingTask.promise;

                    // Iterate through each page of the PDF.
                    for (let page = 1; page <= pdf.numPages; page++) {
                        const pdfPage = await pdf.getPage(page);
                        const originalViewport = pdfPage.getViewport({ scale: 1 });

                        // Calculate scale based on the window width
                        const windowWidth = window.innerWidth;
                        const margin = 20; // Adjust as needed for margins
                        const scale = (windowWidth - margin) / originalViewport.width;

                        const viewport = pdfPage.getViewport({ scale: scale });
                        const canvas = document.createElement('canvas');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;

                        const renderContext = {
                            canvasContext: canvas.getContext('2d'),
                            viewport: viewport,
                        };

                        await pdfPage.render(renderContext).promise;

                        // Update state with the new page image.
                        this.updateStateArray('pageImages', page - 1, canvas.toDataURL('image/png'));
                    }

                    // Update the pageRefs array to match the number of pages.
                    this.pageRefs = [...Array(pdf.numPages)].map(() => React.createRef());

                    resolve();
                } catch (error) {
                    reject(error);
                }
            };

            fileReader.onerror = (error) => {
                reject(error);
            };

            fileReader.readAsArrayBuffer(file);
        });
    }

    // Converts a PDF from a URL to PNG format.
    async convertPdfUrlToPng(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            await this.convertPdfToPng(new Blob([arrayBuffer]));
        } catch (error) {
            console.error("SheetMusic: Error in convertPdfUrlToPng - ", error.message);
        }
    }

    // Event handler for clicking on a measure.
    handleMeasureClick(divElement, pageIndex, measureIndex, event) {
        // Update state with the clicked page and measure indices
        this.setState({
            measureClicked: [pageIndex, measureIndex],
            currentHiddenMeasure: null,
        });

        // Propagate the event to the parent component.
        this.props.onMeasureClick(event);
    }

    // Event handler for analyzing a page.
    async handleAnalyzeClick(pageIndex) {
        // Mark the page as being analyzed.
        this.setState(prevState => ({
            analyzingPages: new Set(prevState.analyzingPages).add(pageIndex),
        }));

        try {
            const imgSrc = this.state.pageImages[pageIndex];

            // Scale the image while maintaining aspect ratio
            const scaledImageSrc = await this.scaleImage(imgSrc, SERVER_IMAGE_WIDTH);

            // Prepare the request body with the scaled image
            const requestBody = {
                imageData: scaledImageSrc // Scaled image data
            };

            // Send the request to the Flask endpoint
            const response = await fetch('./process-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const measures = await response.json();

            // Sort measures based on y-coordinate and then x-coordinate
            measures.sort((a, b) => {
                if (Math.abs(a.y - b.y) <= 50) {
                    return a.x - b.x; // Sort by x-coordinate if y-coordinates are close.
                }
                return a.y - b.y; // Otherwise, sort by y-coordinate.
            });

            // Convert measure dimensions to percentages
            const scaledImage = new Image();
            scaledImage.src = scaledImageSrc;

            await new Promise((resolve, reject) => {
                scaledImage.onload = resolve;
                scaledImage.onerror = reject;
            });

            const measuresAsPercents = measures.map(measure => ({
                x: (measure.x / scaledImage.width),
                y: (measure.y / scaledImage.height),
                w: (measure.w / scaledImage.width),
                h: (measure.h / scaledImage.height),
            }));

            // Update state with the processed measure rectangles.
            this.updateStateArray('measureRects', pageIndex, measuresAsPercents, []);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            // Update the state to indicate analysis completion.
            this.setState(prevState => {
                const updatedAnalyzingPages = new Set(prevState.analyzingPages);
                updatedAnalyzingPages.delete(pageIndex);
                return { analyzingPages: updatedAnalyzingPages };
            });
        }
    }

    // Utility function to scale the image
    scaleImage(imageSrc, targetWidth) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Calculate the scaling factor.
                const scale = targetWidth / img.width;
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = img.height * scale;

                // Draw the scaled image on the canvas.
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Resolve the promise with the data URL of the scaled image.
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = imageSrc;
        });
    }

    // Function to handle the deletion of a measure.
    handleDeleteMeasure = (pageIndex, measureIndex) => {
        this.setState(prevState => {
            const updatedMeasureRects = [...prevState.measureRects];
            updatedMeasureRects[pageIndex] = updatedMeasureRects[pageIndex].filter((_, index) => index !== measureIndex);
            return { measureRects: updatedMeasureRects };
        });
    };

    // Automatically scrolls the viewport to the measure we're about to hide.
    autoScrollToCurrentMeasure() {
        const [pageIndex, measureIndex] = this.state.currentHiddenMeasure;
        const measureRects = this.state.measureRects[pageIndex];
        if (!measureRects || measureRects.length === 0) return;

        const currentMeasure = measureRects[measureIndex];
        if (!currentMeasure) return;

        // Calculate the position to scroll to
        const pageElement = this.pageRefs[pageIndex]?.current;
        if (pageElement) {
            const measureTop = currentMeasure.y * pageElement.clientHeight;
            const offsetTop = pageElement.offsetTop;
            const scrollPosition = offsetTop + measureTop - window.innerHeight * 0.20;

            // Perform the scroll action.
            window.scrollTo({ top: scrollPosition, behavior: 'smooth' });
        }
    }

    hideNextMeasure() {
        if (!this.state.measureClicked) {
            console.error('No measures have been clicked yet.');
            return false;
        }

        let measure = this.state.currentHiddenMeasure;
        if (!measure) {
            // This is our first measure
            measure = this.state.measureClicked;
        } else {
            // Find the next measure
            const pageIndex = measure[0];
            const measureIndex = measure[1];

            if (measureIndex < this.state.measureRects[pageIndex].length - 1) {
                // Increment the measure index
                measure = [measure[0], measure[1] + 1];
            } else if (pageIndex < this.state.measureRects.length - 1) {
                // Increment the page index and reset the measure index
                measure = [measure[0] + 1, 0];
            } else {
                // Out of bounds
                return false;
            }
        }

        this.setState({ currentHiddenMeasure: measure }, () => {
            this.autoScrollToCurrentMeasure();
        });
        return true;
    }

    // A reusable method to update an array in the state
    // There has to be a better way than this
    updateStateArray = (arrayName, pageIndex, newValue, defaultValue = null) => {
        this.setState(prevState => {
            // Copy the current array from the state
            const updatedArray = [...prevState[arrayName]];

            // Ensure the array has at least 'pageIndex + 1' elements
            if (updatedArray.length < pageIndex + 1) {
                updatedArray.length = pageIndex + 1; // Resizes the array
                updatedArray.fill(defaultValue, prevState[arrayName].length, pageIndex + 1); // Fill new slots with null
            }

            // Update the value at the specified index
            updatedArray[pageIndex] = newValue;

            // Return the updated state
            return { [arrayName]: updatedArray };
        });
    }

    isMeasurePlayed(currentPageIndex, currentMeasureIndex) {
        if (!this.state.measureClicked || !this.state.currentHiddenMeasure) {
            return false;
        }

        const [clickedPageIndex, clickedMeasureIndex] = this.state.measureClicked;
        const [hidePageIndex, hideMeasureIndex] = this.state.currentHiddenMeasure;

        // Check if the current measure is within the range
        if (currentPageIndex < clickedPageIndex || currentPageIndex > hidePageIndex) {
            return false;
        } else if (currentPageIndex === clickedPageIndex && currentPageIndex === hidePageIndex) {
            return currentMeasureIndex >= clickedMeasureIndex && currentMeasureIndex <= hideMeasureIndex;
        } else if (currentPageIndex === clickedPageIndex) {
            return currentMeasureIndex >= clickedMeasureIndex;
        } else if (currentPageIndex === hidePageIndex) {
            return currentMeasureIndex <= hideMeasureIndex;
        }

        return true;
    }

    handleButtonPress (pageIndex, measureIndex, e) {
        this.buttonPressTimer = setTimeout(() =>
            this.handleDeleteMeasure(pageIndex, measureIndex), 1250);
    }

    handleButtonRelease (pageIndex, measureIndex, e) {
        clearTimeout(this.buttonPressTimer);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // Start rendering our elements
    ////////////////////////////////////////////////////////////////////////////////
    renderMeasures(pageIndex) {
        if (pageIndex >= this.state.measureRects.length) {
            // This shouldn't really happen
            return;
        }

        const measures = this.state.measureRects[pageIndex];
        if (!measures) {
            // This can happen legitimately on an empty page, for example.
            return;
        }

        return measures.map((measure, measureIndex) => {
            // Determine if the current measure should have the "played" class
            const isPlayed = this.isMeasurePlayed(pageIndex, measureIndex);
            const beats = this.props.beatsPerMeasure;
            const measureDuration = beats * 60 / this.props.bpm; // in seconds
            const transitionDuration = measureDuration * (this.props.transitionEnd - this.props.transitionStart)
            const transitionDelay = measureDuration * this.props.transitionStart;

            return (
            <div
            key={measureIndex}
            className={`measure ${isPlayed ? 'played' : ''}`}
            onClick={(event) => this.handleMeasureClick(this, pageIndex, measureIndex, event)}
            onTouchStart={(e) => this.handleButtonPress(pageIndex, measureIndex, e)}
            onTouchEnd={(e) => this.handleButtonRelease(pageIndex, measureIndex, e)}
            onMouseDown={(e) => this.handleButtonPress(pageIndex, measureIndex, e)}
            onMouseUp={(e) => this.handleButtonRelease(pageIndex, measureIndex, e)}
            onMouseLeave={(e) => this.handleButtonRelease(pageIndex, measureIndex, e)}
            style={{
                position: 'absolute',
                left: `${measure.x*100}%`,
                top: `${measure.y*100}%`,
                width: `${measure.w*100}%`,
                height: `${measure.h*100}%`,
                background: 'rgba(255, 0, 255, 0.15)',
                border: '0px solid red',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                "--transition-time": `${transitionDuration}s`,
                "--transition-time-delay": `${transitionDelay}s`
            }}
            >
                <div className="measure-text">
                {/*measureIndex + 1*/}
                </div>
            </div>
            );
        });
    }

    renderAnalyzeButton(pageIndex) {
        const isAnalyzing = this.state.analyzingPages.has(pageIndex);

        if (isAnalyzing) {
            return (
                <button className="analyze-button-disabled">
                    Analyzing...
                </button>
            );
        } else {
            return (
                <button
                    style={{ position: 'absolute', left: 5, top: 5 }}
                    onClick={() => this.handleAnalyzeClick(pageIndex)}
                >
                    Analyze 🔍
                </button>
            );
        }
    }

    render() {
        return (
            <div>
                {this.state.pageImages.map((dataUrl, pageIndex) => (
                <div 
                    key={pageIndex}
                    ref={this.pageRefs[pageIndex]}
                    className="MusicPage"
                >
                    {this.renderAnalyzeButton(pageIndex)}
                    <img src={dataUrl} alt={`Page ${pageIndex + 1}`} style={{ display: 'block' }} />
                    {this.renderMeasures(pageIndex)}
                </div>
                ))}
            </div>
        );
    }
};

export default SheetMusic;
