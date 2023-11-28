import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import SheetMusic from './SheetMusic'
import sheetMusicLogo from './sheet-music-logo.png';

const App = () => {
    const sheetMusicRef = useRef(null);
    const [uploadedFile, setUploadedFile] = useState(null);
    const [isMetronomeOn, setIsMetronomeOn] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false); // Added state for Play/Stop
    const [bpm, setBpm] = useState(60); // Default BPM

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
            audioContext.resume(); // Safari doesn't play anything without this.

            var beatsCalled = 0;
            metronomeId = setInterval(() => {
                if (isMetronomeOn) {
                    // Create a new oscillator for each tick
                    const oscillator = audioContext.createOscillator();
                    if (beatsCalled === 0) {
                        // For the 0th beat, set the higher pitch frequency
                        oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
                    } else {
                        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
                    }
                    oscillator.type = 'square'; // Adjust as needed
                    oscillator.connect(audioContext.destination);
                    oscillator.start();

                    // Schedule the oscillator to stop after a short duration
                    oscillator.stop(audioContext.currentTime + 0.05); // Adjust the duration as needed
                }

                // If this is the first beat, find the next measure and initiate a
                // hide transition
                if (beatsCalled === 0) {
                    if (!sheetMusicRef.current.hideNextMeasure())
                        setIsPlaying(false);
                }

                if (beatsCalled === 3) {
                    // If this is the last beat, go back to 0!
                    beatsCalled = 0;
                } else {
                    beatsCalled++;
                }
            }, tickDuration);
        } else {
            // Remove the "played" class from any played measures
            const playedMeasures = document.querySelectorAll('.measure.played');
            for (let i = 0; i < playedMeasures.length; i++) {
                const measure = playedMeasures[i];
                measure.classList.remove('played');
            }
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

    const handleFileUpload = (event) => {
        setIsPlaying(false);
        setUploadedFile(event.target.files[0]);
    };

    const handleMeasureClick = (event) => {
        console.log(`Clicked a measure!`);
        setIsPlaying(!isPlaying);
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
          <SheetMusic key={uploadedFile ? uploadedFile.name : null} uploadedFile={uploadedFile} bpm={bpm} ref={sheetMusicRef} onMeasureClick={handleMeasureClick} />
        </div>
    );
};

export default App;
