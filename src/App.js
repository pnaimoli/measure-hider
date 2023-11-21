import React, { useState, useEffect } from 'react';
import './App.css';
import sheetMusicLogo from './sheet-music-logo.png';

import * as pdfjs from 'pdfjs-dist'
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

const App = () => {
  const [images, setImages] = useState([]);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [bpm, setBpm] = useState(60); // Default BPM
  const [opencvReady, setOpencvReady] = useState(false);

  useEffect(() => {
    // Check if OpenCV has loaded
    if (window.cv && window.cv.imread) {
      setOpencvReady(true);
    } else {
      // If not, we listen for a custom event that indicates OpenCV has loaded
      document.addEventListener('opencv-ready', () => setOpencvReady(true), { once: true });
    }
  }, []);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const pngImages = await convertPdfToPng(file);
        setImages(pngImages);
        if (opencvReady) {
          // Once OpenCV is ready, process each image
          pngImages.forEach((dataUrl, index) => {
            const img = new Image();
            img.onload = () => processSheetMusic(img, index);
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

//const processSheetMusic = (imageElement, index) => {
//  // Ensure OpenCV has been loaded
//  if (window.cv && window.cv.imread) {
//    // Read the image from the HTMLImageElement
//    let src = window.cv.imread(imageElement);
//    let dst = new window.cv.Mat();
//    let gray = new window.cv.Mat();
//    let edges = new window.cv.Mat();
//    
//    // Convert to grayscale
//    window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY, 0);
//    
//    // Use Canny edge detector to find edges in the image
//    window.cv.Canny(gray, edges, 50, 150, 3);
//    
//    // Find the lines in the edge detected image
//    let lines = new window.cv.Mat();
//    window.cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 2, 15, 5);
//    
//    // Draw the lines on the source image
//    for (let i = 0; i < lines.rows; ++i) {
//      let startPoint = new window.cv.Point(lines.data32S[i * 4], lines.data32S[i * 4 + 1]);
//      let endPoint = new window.cv.Point(lines.data32S[i * 4 + 2], lines.data32S[i * 4 + 3]);
//      // Draw red lines
//      window.cv.line(src, startPoint, endPoint, [255, 0, 0, 255], 2, window.cv.LINE_AA, 0);
//    }
//    
//    // Create a canvas to show the result
//    window.cv.imshow(`canvas-${index}`, src);
//    
//    // Cleanup the memory
//    src.delete(); dst.delete(); gray.delete(); edges.delete(); lines.delete();
//  } else {
//    console.error('Please make sure OpenCV.js is loaded before calling this function.');
//  }
//};

const processSheetMusic = (imageElement, index) => {
  // Ensure OpenCV has been loaded
  if (window.cv && window.cv.imread) {
    // Read the image from the HTMLImageElement
    let src = window.cv.imread(imageElement);
    let gray = new window.cv.Mat();
    let edges = new window.cv.Mat();
    
    // Convert to grayscale
    window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY, 0);
    
    // Use adaptive thresholding to get a binary image
    window.cv.adaptiveThreshold(gray, gray, 255, window.cv.ADAPTIVE_THRESH_GAUSSIAN_C, window.cv.THRESH_BINARY, 11, 2);
    window.cv.bitwise_not(gray, gray);
    
    // Detect vertical lines using morphological operations
    let verticalKernel = window.cv.getStructuringElement(window.cv.MORPH_RECT, new window.cv.Size(1, 25));
    window.cv.morphologyEx(
      gray,
      edges,
      window.cv.MORPH_OPEN,
      verticalKernel,
      new window.cv.Point(-1, -1),
      2
    );
    
    // Find contours of the detected lines
    let contours = new window.cv.MatVector();
    let hierarchy = new window.cv.Mat();
    window.cv.findContours(edges, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE);

    // Filter out contours that are too short or too long to be measure bars
    let filteredContours = [];
    for (let i = 0; i < contours.size(); ++i) {
      let rect = window.cv.boundingRect(contours.get(i));
      if (rect.height > 50 && rect.height < 1000) {
        filteredContours.push(contours.get(i));
      }
    }
    
    // Draw red lines on the source image
    for (let i = 0; i < filteredContours.length; ++i) {
      let rect = window.cv.boundingRect(filteredContours[i]);
      window.cv.rectangle(src, new window.cv.Point(rect.x, rect.y), new window.cv.Point(rect.x + rect.width, rect.y + rect.height), [255, 0, 0, 255], 2, window.cv.LINE_AA, 0);
    }

    // Create a canvas to show the result
    window.cv.imshow(`canvas-${index}`, src);
    
    // Cleanup the memory
    src.delete(); gray.delete(); edges.delete();
  } else {
    console.error('Please make sure OpenCV.js is loaded before calling this function.');
  }
};


export default App;
