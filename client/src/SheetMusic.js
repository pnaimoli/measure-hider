import React, { Component } from 'react';
import './SheetMusic.css';

import * as pdfjs from 'pdfjs-dist'
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

class SheetMusic extends Component {
    constructor(props) {
        super(props);
        this.state = {
            pageImages: [],
            measureRects: [],
            measureClicked: null,
            currentHiddenMeasure: null,
            analyzingPages: new Set(),
        };
    }

    componentDidMount() {
        if (this.props.uploadedFile) {
          this.convertPdfToPng(this.props.uploadedFile)
            .then()
            .catch(error => console.error("Error converting PDF to PNG: ", error));
        }
    }

    componentWillUnmount() {
    }

    convertPdfToPng(file) {
        const fileReader = new FileReader();

        return new Promise((resolve, reject) => {
            fileReader.onload = async (event) => {
                const arrayBuffer = event.target.result;
                try {
                    const loadingTask = pdfjs.getDocument({ data: arrayBuffer, verbosity: pdfjs.VerbosityLevel.ERRORS });
                    const pdf = await loadingTask.promise;

                    const pageNum = pdf.numPages;

                    for (let page = 1; page <= pageNum; page++) {
                        const pdfPage = await pdf.getPage(page);
                        const viewport = pdfPage.getViewport({ scale: 1.5 });
                        const canvas = document.createElement('canvas');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;

                        const renderContext = {
                            canvasContext: canvas.getContext('2d'),
                            viewport: viewport,
                        };

                        await pdfPage.render(renderContext).promise;

                        this.updateStateArray('pageImages', page - 1, canvas.toDataURL('image/png'));
                    }

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

    handleMeasureClick(divElement, pageIndex, measureIndex, event) {
        // Update state with the clicked page and measure indices
        this.setState({
            measureClicked: [pageIndex, measureIndex],
            currentHiddenMeasure: null,
        });

        this.props.onMeasureClick(event);
    }

    handleAnalyzeClick(pageIndex) {
        this.setState(prevState => ({
            analyzingPages: new Set(prevState.analyzingPages).add(pageIndex),
        }), () => {
            const imgSrc = this.state.pageImages[pageIndex];

            // Prepare the request body
            const requestBody = {
                imageData: imgSrc  // Assuming this is a data:image base64 string
            };

            // Send the request to the Flask endpoint
            fetch('./process-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })
            .then(response => response.json())
            .then(measures => {
                // Sort measures based on y-coordinate and then x-coordinate
                measures.sort((a, b) => {
                    // Compare the y-coordinate (top to bottom)
                    if (Math.abs(a.y - b.y) <= 50) {
                        return a.x - b.x; // Sort by x-coordinate (left to right)
                    }
                    return a.y - b.y; // Sort by y-coordinate
                });

                this.updateStateArray('measureRects', pageIndex, measures, []);
            })
            .catch(error => {
                console.error('Error:', error);
                // Handle the error or update the state as needed
            })
            .finally(() => {
                this.setState(prevState => {
                    const updatedAnalyzingPages = new Set(prevState.analyzingPages);
                    updatedAnalyzingPages.delete(pageIndex);
                    return { analyzingPages: updatedAnalyzingPages };
                });
            });
        });
    }

    handleDeleteMeasure = (pageIndex, measureIndex) => {
        this.setState(prevState => {
            const updatedMeasureRects = [...prevState.measureRects];
            updatedMeasureRects[pageIndex] = updatedMeasureRects[pageIndex].filter((_, index) => index !== measureIndex);
            return { measureRects: updatedMeasureRects };
        });
    };

    autoScrollToCurrentMeasure() {
        const [pageIndex, measureIndex] = this.state.currentHiddenMeasure;
        const measureRects = this.state.measureRects[pageIndex];
        if (!measureRects || measureRects.length === 0) return;

        const currentMeasure = measureRects[measureIndex];
        if (!currentMeasure) return;

        // Calculate the position to scroll to
        // Assuming each page is within a container with a unique ID like "page-0", "page-1", etc.
        const pageElement = document.getElementById(`page-${pageIndex}`);
        if (pageElement) {
            const measureTop = currentMeasure.y; // Y coordinate of the measure
            const offsetTop = pageElement.offsetTop;
            const scrollPosition = offsetTop + measureTop - window.innerHeight * 0.20;

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
                left: measure.x,
                top: measure.y,
                width: measure.w,
                height: measure.h,
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
                <div key={pageIndex} id={`page-${pageIndex}`} className="MusicPage">
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
