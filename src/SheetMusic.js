import React, { Component } from 'react';
import { detectMeasures, deskew } from './measureDetection';

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
        };
    }

    componentDidMount() {
        console.log('SheetMusic component mounted:');
        console.log('  ' + JSON.stringify(this.props));
        console.log('  ' + JSON.stringify(this.state));

        if (this.props.uploadedFile) {
          console.log(`Uploading ${this.props.uploadedFile}`);

          this.convertPdfToPng(this.props.uploadedFile)
            .then(() => console.log('Conversion successful!'))
            .catch(error => console.error("Error converting PDF to PNG: ", error));
        }
    }

    componentWillUnmount() {
        console.log('SheetMusic component unmounted');
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.bpm !== prevProps.bpm) {
            console.log('BPM Changed!');
        }

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

        // Detect Measures
        if (this.state.deskewedImages !== prevState.deskewedImages) {
            for (let pageIndex = this.state.measureRects.length;
                 pageIndex < this.state.deskewedImages.length;
                 ++pageIndex) {

                const img = new Image();
                img.onload = () => {
                    const measures = detectMeasures(img);
                    this.updateStateArray('measureRects', pageIndex, measures);
                };
                img.src = this.state.deskewedImages[pageIndex];
            }
        }

    }

    convertPdfToPng(file) {
        const fileReader = new FileReader();

        return new Promise((resolve, reject) => {
            fileReader.onload = async (event) => {
                const arrayBuffer = event.target.result;
                try {
                    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
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

    handleMeasureClick(divElement, event) {
    }
//    const handleMeasureClick = (divElement, event) => {
//        // Remove the "clicked" attribute from all measures
//        const allMeasures = document.querySelectorAll('.measure');
//        allMeasures.forEach((measure) => {
//            measure.removeAttribute('data-clicked');
//        });
//
//        // Add the "clicked" attribute to the clicked measure
//        const clickedMeasure = event.currentTarget;
//        clickedMeasure.setAttribute('data-clicked', 'true');
//    };

//    const hideNextMeasure = () => {
//        const clickedMeasure = document.querySelector('.measure[data-clicked="true"]');
//        if (clickedMeasure) {
//            const unplayedMeasures = document.querySelectorAll('.measure:not(.played)');
//
//            let nextMeasure;
//            for (let i = 0; i < unplayedMeasures.length; i++) {
//                // Check if unplayedMeasures appears after the clickedMeasure
//                const unplayedMeasure = unplayedMeasures[i];
//                const position = clickedMeasure.compareDocumentPosition(unplayedMeasure);
//
//                // Check if unplayedMeasure appears after clickedMeasure
//                if (unplayedMeasure === clickedMeasure || position & Node.DOCUMENT_POSITION_FOLLOWING) {
//                    // This means unplayedMeasure appears after clickedMeasure
//                    nextMeasure = unplayedMeasure;
//                    break; // Stop after the first unplayed measure found after clickedMeasure
//                }
//            }
//            if (!nextMeasure) {
//                // If there are no more unplayed measures, stop!
//                return false;
//            } else {
//                nextMeasure.classList.add('played');
//                return true;
//            }
//        } else {
//            console.log('No measures have been clicked yet.');
//        }
//        return false;
//    };

    // A reusable method to update an array in the state
    // There has to be a better way than this
    updateStateArray = (arrayName, pageIndex, newValue) => {
        this.setState(prevState => {
            // Copy the current array from the state
            const updatedArray = [...prevState[arrayName]];

            // Ensure the array has at least 'pageIndex + 1' elements
            if (updatedArray.length < pageIndex + 1) {
                updatedArray.length = pageIndex + 1; // Resizes the array
                updatedArray.fill(null, prevState[arrayName].length, pageIndex + 1); // Fill new slots with null
            }

            // Update the value at the specified index
            updatedArray[pageIndex] = newValue;

            // Return the updated state
            return { [arrayName]: updatedArray };
        });
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

        return measures.map((measure, measureIndex) => (
            <div
            key={measureIndex}
            className="measure"
            onClick={(event) => this.handleMeasureClick(this, event)}
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
            <div className="measure-text">
            {measureIndex + 1}
            </div>
            </div>
        ));
    }

    render() {
        return (
            <div>
                {this.state.deskewedImages.map((dataUrl, pageIndex) => (
                <div key={pageIndex} className="MusicPage">
                  <img src={dataUrl} alt={`Page ${pageIndex + 1}`} style={{ display: 'block' }} />
                  {this.renderMeasures(pageIndex)}
                </div>
                ))}
            </div>
        );
    }
};

export default SheetMusic;
