import React, { useState } from 'react';
import './App.css';
import sheetMusicLogo from './sheet-music-logo.png';

import * as pdfjs from 'pdfjs-dist'
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

const App = () => {
  const [images, setImages] = useState([]);

  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [bpm, setBpm] = useState(60); // Default BPM

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const pngImages = await convertPdfToPng(file);
        setImages(pngImages);
      } catch (error) {
        console.error("Error converting PDF to PNG: ", error);
      }
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <img src={sheetMusicLogo} alt="Sheet Music" className="SheetMusicLogo" />
        <div className="MetronomeSettings">
          <label>
            Metronome:
            <input 
              type="checkbox" 
              checked={isMetronomeOn} 
              onChange={() => setIsMetronomeOn(!isMetronomeOn)} 
            />
            <span className="MetronomeToggleText">
              {isMetronomeOn ? 'ON' : 'OFF'}
            </span>
          </label>
          <input 
            type="range" 
            min="40" 
            max="240" 
            value={bpm} 
            onChange={(e) => setBpm(e.target.value)}
            disabled={!isMetronomeOn}
          />
          {bpm} BPM
        </div>
        <div className="UploadSection">
          <input type="file" onChange={handleFileUpload} accept="application/pdf" />
        </div>
      </header>
      <div>
        {images.map((imgSrc, index) => (
          <img key={index} src={imgSrc} alt={`page-${index + 1}`} />
        ))}
      </div>
      {/* Rest of your component */}
    </div>
  );
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

export default App;
