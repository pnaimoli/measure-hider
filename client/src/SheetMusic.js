import React, { Component } from 'react';
import './SheetMusic.css';
import { detectMeasuresOnnx, deskew } from './measureDetection';

import * as pdfjs from 'pdfjs-dist'
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

class SheetMusic extends Component {
    constructor(props) {
        super(props);
        this.state = {
            pageImages: [],
            deskewedImages: [],
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

    componentDidUpdate(prevProps, prevState) {
        // Deskew
        if (this.state.pageImages !== prevState.pageImages) {
            for (let pageIndex = this.state.deskewedImages.length;
                 pageIndex < this.state.pageImages.length;
                 ++pageIndex) {

                const img = new Image();
                img.onload = () => {
                    const deskewedImage = deskew(img);
                    this.updateStateArray('deskewedImages', pageIndex, deskewedImage);
                };
                img.src = this.state.pageImages[pageIndex];
            }
        }
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
                        canvas.height = Math.min(1200, viewport.height);
                        canvas.width = Math.min(1200, viewport.width);

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
            const img = new Image();
            img.onload = () => {
                detectMeasuresOnnx(img).then(measures => {
                    this.updateStateArray('measureRects', pageIndex, measures, []);
                    this.setState(prevState => {
                        const updatedAnalyzingPages = new Set(prevState.analyzingPages);
                        updatedAnalyzingPages.delete(pageIndex);
                        return { analyzingPages: updatedAnalyzingPages };
                    });
                });
            };
            img.src = this.state.deskewedImages[pageIndex];
        });
    }

    handleDeleteMeasure = (pageIndex, measureIndex, event) => {
        event.stopPropagation(); // Prevents the event from bubbling up to parent elements

        this.setState(prevState => {
            const updatedMeasureRects = [...prevState.measureRects];
            updatedMeasureRects[pageIndex] = updatedMeasureRects[pageIndex].filter((_, index) => index !== measureIndex);
            return { measureRects: updatedMeasureRects };
        });
    };

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

        this.setState({currentHiddenMeasure: measure});
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

            return (
            <div
            key={measureIndex}
            className={`measure ${isPlayed ? 'played' : ''}`}
            onClick={(event) => this.handleMeasureClick(this, pageIndex, measureIndex, event)}
            style={{
                position: 'absolute',
                left: measure.x,
                top: measure.y,
                width: measure.width,
                height: measure.height,
                background: 'rgba(255, 0, 255, 0.15)',
                border: '0px solid red',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                "--transition-time": 4*60/this.props.bpm * 2/4 + "s",
                "--transition-time-delay": 4*60/this.props.bpm * 1/4 + "s",
            }}
            >
                <div className="measure-delete-btn" onClick={(event) => this.handleDeleteMeasure(pageIndex, measureIndex, event)}>
                    &#10006;
                </div>
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
                {this.state.deskewedImages.map((dataUrl, pageIndex) => (
                <div key={pageIndex} className="MusicPage">
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