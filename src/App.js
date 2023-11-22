import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import sheetMusicLogo from './sheet-music-logo.png';

import { detectMeasures } from './measureDetection';
import * as pdfjs from 'pdfjs-dist'
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

const App = () => {
    const [images, setImages] = useState([]);
    const [isMetronomeOn, setIsMetronomeOn] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false); // Added state for Play/Stop
    const bpmRef = useRef(60); // Default BPM
    const animationRef = useRef(null);
    const [allMeasuresByCanvas, setAllMeasuresByCanvas] = useState({}); // Changed to useState
    const nextMeasureRef = useRef(-1);
    const nextCanvasRef = useRef(-1);

    useEffect(() => {
//        return () => {
//            // Cleanup the animation interval when the component unmounts
//            clearInterval(animationRef.current);
//        };
    }, []);

    const renderMeasures = (canvasIndex) => {
        if (!allMeasuresByCanvas[canvasIndex]) {
            return;
        }
        return allMeasuresByCanvas[canvasIndex].map((measure, index) => (
            <div
            key={index}
            className="measure"
            onClick={(event) => handleMeasureClick(this, event)}
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
            }}
            >
            <div className="measure-text">
            {index + 1}
            </div>
            </div>
        ));
    };

    //////////////////////////////////////////////////////////////////////////////// 
    // Draw debug information and add 'click' listeners to each page
    //////////////////////////////////////////////////////////////////////////////// 
    const handleCanvasClick = useCallback((canvasIndex, event) => {
        // If we're already playing, clicking anywhere stops the app.
        if (isPlaying) {
            setIsPlaying(!isPlaying);
            return;
        }

        // If there aren't measures on this page, just get out.
        const measures = allMeasuresByCanvas[canvasIndex];
        if (!measures) {
            return;
        }

        // Find the measure we clicked on.
        let canvasElement = document.getElementById(`canvas-${canvasIndex}`);
        const canvasRect = canvasElement.getBoundingClientRect();
        const mouseX = event.clientX - canvasRect.left;
        const mouseY = event.clientY - canvasRect.top;

        // Loop through the measures and check if the click is within any of them
        let measureIndex;
        for (let i = 0; i < measures.length; i++) {
            const measure = measures[i];
            if (
                mouseX >= measure.x &&
                mouseX <= measure.x + measure.width &&
                mouseY >= measure.y &&
                mouseY <= measure.y + measure.height
            ) {
                measureIndex = i;
                break;
            }
        };

        // If we didn't click inside a measure, turn off the app.
        if (measureIndex === undefined) {
            setIsPlaying(false);
            return;
        }

        // The click is within this measure, you can perform your actions here
        console.log(`Clicked on page ${canvasIndex}, measure ${measureIndex + 1}`);

        // Start the animation
        const duration = (60 / bpmRef.current) * 1000;  // This should be in milliseconds?
        animationRef.current = setInterval(() => {
            // Hide measures sequentially
            hideNextMeasure(canvasIndex, measureIndex);

            // Is there a next measure?
            if (measureIndex === measures.length - 1) {
                // Stop for now, don't go on to the next page.
                clearInterval(animationRef.current);
            }
        }, duration / 4.0); // TODO: This only works for 4/4 time

        // Toggle the Play/Stop state
        nextMeasureRef.current = measureIndex;
        nextCanvasRef.current = canvasIndex;
        setIsPlaying(true);
    }, [isPlaying, allMeasuresByCanvas]);

    useEffect(() => {
        images.forEach((dataUrl, index) => {
            const img = new Image();
            img.onload = () => {
                const allMeasures = detectMeasures(img, index);

                // Update the state with allMeasures for this canvas index
                setAllMeasuresByCanvas((prevState) => ({
                    ...prevState,
                    [index]: allMeasures,
                }));
            };
            img.src = dataUrl;
        });
    }, [images, isPlaying, handleCanvasClick]);


    //////////////////////////////////////////////////////////////////////////////// 
    // Handle sound effects
    //////////////////////////////////////////////////////////////////////////////// 
    useEffect(() => {
        // We'd like to just do:
        // const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // but we can't since AudioContexts need to be created as a result of a user
        // gesture and this function gets called pretty early on.
        let audioContext;
        let animation;
        let intervalId;

        if (isPlaying && isMetronomeOn) {
            // Calculate tick duration and metronome logic here
            const tickDuration = (60 / bpmRef.current) * 1000; // Duration in milliseconds
            audioContext = new (window.AudioContext || window.webkitAudioContext)();

            intervalId = setInterval(() => {
                // Create a new oscillator for each tick
                const oscillator = audioContext.createOscillator();
                oscillator.type = 'square'; // Adjust as needed
                oscillator.connect(audioContext.destination);
                oscillator.start();

                // Schedule the oscillator to stop after a short duration
                oscillator.stop(audioContext.currentTime + 0.1); // Adjust the duration as needed
            }, tickDuration);
        }

        // Cleanup
        return () => {
            if(animation) {
                animation.kill();
            }
            clearInterval(intervalId);
            // Close the AudioContext when cleaning up
            if (audioContext) {
                audioContext.close();
            }
        };
    }, [isPlaying, isMetronomeOn, allMeasuresByCanvas]);

    const hideNextMeasure = (rect, bpm, numerator, denominator) => {
        // Implement animated gradient blur to hide the next measure
        // ...

        // After hiding the last measure, stop the animation
        if (false/* Check if all measures are hidden */) {
            clearInterval(animationRef.current);
            setIsPlaying(false); // Set to Stop state
        }
    };

    const handleMeasureClick = async (divElement, event) => {
        // If we're already playing, clicking anywhere stops the app.
        if (isPlaying) {
            setIsPlaying(!isPlaying);
            return;
        }

        // The click is within this measure, you can perform your actions here
        console.log(`Clicked a measure!`);

//        // Start the animation
//        const duration = (60 / bpmRef.current) * 1000;  // This should be in milliseconds?
//        animationRef.current = setInterval(() => {
//            // Hide measures sequentially
//            hideNextMeasure(canvasIndex, measureIndex);
//
//            // Is there a next measure?
//            if (measureIndex === measures.length - 1) {
//                // Stop for now, don't go on to the next page.
//                clearInterval(animationRef.current);
//            }
//        }, duration / 4.0); // TODO: This only works for 4/4 time
//
//        // Toggle the Play/Stop state
//        nextMeasureRef.current = measureIndex;
//        nextCanvasRef.current = canvasIndex;
//        setIsPlaying(true);
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (file) {
            // Clear the allMeasuresByCanvas state when a new file is loaded
            setAllMeasuresByCanvas({});
            setIsPlaying(false);

            try {
                const pngImages = await convertPdfToPng(file);
                setImages(pngImages);
            } catch (error) {
                console.error("Error converting PDF to PNG: ", error);
            }
        }
    };

    const convertPdfToPng = async (file) => {
        const fileReader = new FileReader();

        return new Promise((resolve, reject) => {
            fileReader.onload = async (event) => {
                const arrayBuffer = event.target.result;
                try {
                    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
                    const pdf = await loadingTask.promise;

                    const pageNum = pdf.numPages;
                    const images = [];

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
                        images.push(canvas.toDataURL('image/png'));
                    }

                    resolve(images);
                } catch (error) {
                    reject(error);
                }
            };

            fileReader.onerror = (error) => {
                reject(error);
            };

            fileReader.readAsArrayBuffer(file);
        });
    };

    return (
        <div className="App">
          <header className="App-header">
            <img src={sheetMusicLogo} alt="Sheet Music" className="SheetMusicLogo" />
            <div className="MetronomeSettings">
              <label>
                Metronome:
                <input type="checkbox" checked={isMetronomeOn} onChange={() => setIsMetronomeOn(!isMetronomeOn)}/>
                <span className="MetronomeToggleText">
                  {isMetronomeOn ? 'ON' : 'OFF'}
                </span>
              </label>
                <input type="range" min="40" max="240" value={bpmRef.current} onChange={(e) => (bpmRef.current = e.target.value)} disabled={!isMetronomeOn} />
                {bpmRef.current} BPM
            </div>
            <div className="UploadSection">
              <input type="file" onChange={handleFileUpload} accept="application/pdf" />
            </div>
          </header>
          <div>
          {images.map((imgSrc, index) => (
            <div key={index} className="MusicPage">
              <img src={imgSrc} alt={`Page ${index + 1}`} style={{ display: 'block' }} />
              {renderMeasures(index)}
            </div>
          ))}
          </div>
          {/* Rest of your component */}
        </div>
    );
};

export default App;
