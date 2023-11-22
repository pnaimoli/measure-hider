import React, { useState, useEffect } from 'react';
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
    const [bpm, setBpm] = useState(60); // Default BPM
    const [allMeasuresByCanvas, setAllMeasuresByCanvas] = useState({}); // Changed to useState

    ////////////////////////////////////////////////////////////////////////////////
    // Once the images are loaded, detect the measures
    ////////////////////////////////////////////////////////////////////////////////
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
    }, [images]);

    ////////////////////////////////////////////////////////////////////////////////
    // This is the main function that handles playing the metronome
    // and initiating the animations.
    ////////////////////////////////////////////////////////////////////////////////
    useEffect(() => {
        // We'd like to just do:
        // const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // but we can't since AudioContexts need to be created as a result of a user
        // gesture and this function gets called pretty early on.
        let audioContext;
        let metronomeId;

        if (isPlaying) {
            // Calculate tick duration and metronome logic here
            const tickDuration = (60 / bpm) * 1000; // Duration in milliseconds
            audioContext = new (window.AudioContext || window.webkitAudioContext)();

            var beatsCalled = 0;
            metronomeId = setInterval(() => {
                if (isMetronomeOn) {
                    // Create a new oscillator for each tick
                    const oscillator = audioContext.createOscillator();
                    oscillator.type = 'square'; // Adjust as needed
                    oscillator.connect(audioContext.destination);
                    oscillator.start();

                    // Schedule the oscillator to stop after a short duration
                    oscillator.stop(audioContext.currentTime + 0.1); // Adjust the duration as needed
                }

                // If this is the first beat, find the next measure and initiate a
                // hide transition


                // If this is the last beat, go back to 0!
                if (++beatsCalled === 3) {
                    clearInterval(metronomeId);
                    beatsCalled = 0;
                }
            }, tickDuration);
        }

        // Cleanup
        return () => {
            clearInterval(metronomeId);
            // Close the AudioContext when cleaning up
            if (audioContext) {
                audioContext.close();
            }
        };
    }, [isPlaying, isMetronomeOn, bpm]);

    const handleMeasureClick = async (divElement, event) => {
        console.log(`Clicked a measure!`);
        setIsPlaying(!isPlaying);
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

    ////////////////////////////////////////////////////////////////////////////////
    // Use the pdfjs library to convert a PDF to a set of PNGs
    ////////////////////////////////////////////////////////////////////////////////
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

    const renderMeasures = (canvasIndex) => {
        // This can happen legitimately on an empty page, for example.
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
                "--transition-time": 4*60/bpm * 2/4 + "s",
                "--transition-time-delay": 4*60/bpm * 1/4 + "s",
            }}
            >
            <div className="measure-text">
            {/*index + 1*/}
            </div>
            </div>
        ));
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
                <input type="range" min="40" max="240" value={bpm} onChange={(e) => (setBpm(e.target.value))} disabled={!isMetronomeOn} />
                {bpm} BPM
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
