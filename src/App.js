import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import sheetMusicLogo from './sheet-music-logo.png';

import { detectMeasures } from './measureDetection';
import * as pdfjs from 'pdfjs-dist'
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

const App = () => {
    const [images, setImages] = useState([]);
    const [isMetronomeOn, setIsMetronomeOn] = useState(true);
    const [bpm, setBpm] = useState(60); // Default BPM
    const [opencvReady, setOpencvReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false); // Added state for Play/Stop
    const animationRef = useRef(null);
    const [allMeasuresByCanvas, setAllMeasuresByCanvas] = useState({});

    useEffect(() => {
        // Check if OpenCV has loaded
        if (window.cv && window.cv.imread) {
            setOpencvReady(true);
        } else {
            // If not, we listen for a custom event that indicates OpenCV has loaded
            document.addEventListener('opencv-ready', () => setOpencvReady(true), { once: true });
        }

        return () => {
            // Cleanup the animation interval when the component unmounts
            clearInterval(animationRef.current);
        };
    }, []);

    // useEffect to add the click listener when allMeasuresByCanvas changes
    useEffect(() => {
        const handleCanvasClick = (canvasIndex, event) => {
            let canvasElement = document.getElementById(`canvas-${canvasIndex}`);
            const canvasRect = canvasElement.getBoundingClientRect();
            const mouseX = event.clientX - canvasRect.left;
            const mouseY = event.clientY - canvasRect.top;

            // Check if the canvasId exists in allMeasuresByCanvas
            if (allMeasuresByCanvas[canvasIndex]) {
                // Implement your logic to start/stop the animation for this canvas
                // You can use the canvasId to access the specific measures for this canvas

                // ... your animation logic here
                if (isPlaying) {
                    // Stop the animation and reveal the music
                    clearInterval(animationRef.current);

                    // Toggle the Play/Stop state
                    setIsPlaying(!isPlaying);
                } else {
                    // Find the measure we clicked on.
                    const measures = allMeasuresByCanvas[canvasIndex];

                    // Loop through the measures and check if the click is within any of them
                    for (let i = 0; i < measures.length; i++) {
                        const measure = measures[i];
                        if (
                            mouseX >= measure.x &&
                            mouseX <= measure.x + measure.width &&
                            mouseY >= measure.y &&
                            mouseY <= measure.y + measure.height
                        ) {
                            // The click is within this measure, you can perform your actions here
                            console.log(`Clicked on page ${canvasIndex}, measure ${i + 1}`);

                            // Start the animation
                            const duration = (60 / bpm) * 1000;  // This should be in milliseconds?
                            animationRef.current = setInterval(() => {
                                // Hide measures sequentially
                                hideNextMeasure(canvasIndex, i);
                            }, duration*4); // This only works for 4/4 time :(

                            // Toggle the Play/Stop state
                            setIsPlaying(!isPlaying);
                            break;
                        }
                    }
                }
            }
        };

        // Loop through canvas indices and add click listeners
        for (let canvasIndex = 0; canvasIndex < Object.keys(allMeasuresByCanvas).length; canvasIndex++) {
            const canvasElement = document.getElementById(`canvas-${canvasIndex}`);

            if (canvasElement) {
                // Attach the click event listener
                canvasElement.addEventListener('click', (event) => {
                    // Call the arrow function with access to state variables
                    handleCanvasClick(canvasIndex, event);
                }, { once: true });
            }
        }

        return () => {
            // Cleanup the animation interval when the component unmounts
            clearInterval(animationRef.current);
        };
    }, [allMeasuresByCanvas, isPlaying, bpm]);

    //////////////////////////////////////////////////////////////////////////////// 
    // Handle sound effects
    //////////////////////////////////////////////////////////////////////////////// 
    useEffect(() => {
        // Create an AudioContext instance locally
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        let intervalId;

        if (isPlaying && isMetronomeOn && audioContext) {
            // Calculate tick duration and metronome logic here
            const tickDuration = (60 / bpm) * 1000; // Duration in milliseconds

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
            clearInterval(intervalId);
            // Close the AudioContext when cleaning up
            audioContext.close();
        };
    }, [isPlaying, bpm, isMetronomeOn]);

    const hideNextMeasure = (canvas, measure) => {
        // Implement animated gradient blur to hide the next measure
        // ...

        // After hiding the last measure, stop the animation
        if (false/* Check if all measures are hidden */) {
            clearInterval(animationRef.current);
            setIsPlaying(false); // Set to Stop state
        }
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
                if (opencvReady) {
                    // Once OpenCV is ready, process each image
                    pngImages.forEach((dataUrl, index) => {
                        const img = new Image();
                        img.onload = () => {
                            const allMeasures = detectMeasures(img, index);

                            // Update the state with allMeasures for this canvas index
                            setAllMeasuresByCanvas((prevState) => ({
                                ...prevState,
                                [index]: allMeasures,
                            }));

                            // Get the canvas to show the result
                            let canvasElement = document.getElementById(`canvas-${index}`);
                            const ctx = canvasElement.getContext('2d');
                            ctx.canvas.width = img.width;
                            ctx.canvas.height = img.height;
                            ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);

                            // Draw measure rectangles and numbers
                            ctx.strokeStyle = 'red'; // Border color
                            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; // Transparent fill color
                            ctx.font = '16px Arial'; // Font for measure numbers
                            ctx.lineWidth = 2; // Border width

                            allMeasures.forEach((rect, measureIndex) => {
                                // Draw the measure rectangle
                                ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                                ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

                                // Draw the measure number above the rectangle
                                const measureNumber = measureIndex + 1;
                                const textWidth = ctx.measureText(measureNumber.toString()).width;
                                const textX = rect.x + rect.width / 2 - textWidth / 2;
                                const textY = rect.y - 10; // Position above the rectangle
                                ctx.fillText(measureNumber.toString(), textX, textY);
                            });

                            // Attach a click event listener to the canvas
                            //                            const canvasElement = document.getElementById(`canvas-${index}`);
                            //                            canvasElement.addEventListener('click', (event) => handleCanvasClick(index, event));
                        };
                        img.src = dataUrl;
                    });
                } else {
                    console.error("OpenCV is not ready");
                }
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
              <input type="range" min="40" max="240" value={bpm} onChange={(e) => setBpm(e.target.value)} disabled={!isMetronomeOn} />
                {bpm} BPM
            </div>
            <div className="UploadSection">
              <input type="file" onChange={handleFileUpload} accept="application/pdf" />
            </div>
          </header>
          <div>
          {images.map((imgSrc, index) => (
            <div key={index}>
              <img src={imgSrc} alt={`Page ${index + 1}`} style={{ display: 'none' }} />
              <canvas id={`canvas-${index}`}></canvas>
            </div>
          ))}
          </div>
          {/* Rest of your component */}
        </div>
    );
};

export default App;
