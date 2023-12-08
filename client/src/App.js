import React, { useState, useEffect, useRef } from 'react';
import MultiRangeSlider from "multi-range-slider-react";
import './App.css';
import SheetMusic from './SheetMusic'
import sheetMusicLogo from './sheet-music-logo.png';
import packageInfo from '../package.json';

const App = () => {
    const sheetMusicRef = useRef(null);
    const [uploadedFile, setUploadedFile] = useState(null);
    const [isMetronomeOn, setIsMetronomeOn] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false); // Added state for Play/Stop
    const [bpm, setBpm] = useState(60); // Default BPM
    const [beatsPerMeasure, setBeatsPerMeasure] = useState(4); // Default time signature
    const [transitionStart, setTransitionStart] = useState(0.25); // Default start of transition (e.g., 25% into the measure)
    const [transitionEnd, setTransitionEnd] = useState(0.75); // Default end of transition (e.g., 75% into the measure)
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            const offset = window.scrollY;
            setIsScrolled(offset > 50); // Set true if scrolled more than 50px
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

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

                if (beatsCalled === beatsPerMeasure - 1) {
                    // If this is the last beat, go back to 0!
                    beatsCalled = 0;
                } else {
                    beatsCalled++;
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
    }, [isPlaying, isMetronomeOn, bpm, beatsPerMeasure]);

    const handleFileUpload = (event) => {
        setIsPlaying(false);
        setUploadedFile(event.target.files[0]);
    };

    const handleMeasureClick = (event) => {
        setIsPlaying(!isPlaying);
    };

    return (
        <div className="App">
          <header className={`App-header ${isScrolled ? 'shrink' : ''}`}>
            {/* Version Display */}
            <div className="version-display">
                Measure Hider {packageInfo.version}
            </div>
            <img src={sheetMusicLogo} alt="Sheet Music" className="SheetMusicLogo" />
            <div className="MetronomeSettings">
              <label>
                <select value={beatsPerMeasure} onChange={(e) => setBeatsPerMeasure(e.target.value)}>
                  <option value="4">4/4</option>
                  <option value="3">3/4</option>
                </select>
              </label>
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
            <div className="range-slider">
              <MultiRangeSlider
                  min={0}
                  max={1}
                  step={0.1}
                  ruler={false}
                  label={true}
                  preventWheel={false}
                  minValue={.25}
                  maxValue={.75}
                  style={{
                    border: 'none',
                    boxShadow: 'none',
                  }}
                  onInput={(e) => {setTransitionStart(e.minValue);
                                   setTransitionEnd(e.maxValue)}}
              />
            </div>
            <div className="UploadSection">
              <input type="file" onChange={handleFileUpload} accept="application/pdf" />
            </div>
          </header>
          <div className="App-content">
            {!uploadedFile && (
            <div className="InstructionalContent">
                <h2>Welcome to Measure Hider</h2>
                <div className="Instructions">
                    <div className="InstructionStep">
                        <span className="Icon">📤</span>
                        <p>To begin, upload a file above.</p>
                    </div>
                    <div className="InstructionStep">
                        <span className="Icon">🔍</span>
                        <p>Click the "Analyze" button on each page to start the measure detection algorithm (this might be slow!).</p>
                    </div>
                    <div className="InstructionStep">
                        <span className="Icon">🎀</span>
                        <p>Auto-detected measures will appear in pink.</p>
                    </div>
                    <div className="InstructionStep">
                        <span className="Icon">⏱️</span>
                        <p>Select your metronome's BPM and click any measure to start.</p>
                    </div>
                    <div className="InstructionStep">
                        <span className="Icon">🛑</span>
                        <p>Click any measure to stop.</p>
                    </div>
                </div>
            </div>
            )}
            <SheetMusic key={uploadedFile ? uploadedFile.name : null} uploadedFile={uploadedFile} bpm={bpm} transitionStart={transitionStart} transitionEnd={transitionEnd} beatsPerMeasure={beatsPerMeasure} ref={sheetMusicRef} onMeasureClick={handleMeasureClick} />
          </div>
        </div>
    );
};

export default App;
