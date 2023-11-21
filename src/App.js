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

            ////////////////////////////////////////////////////////////      
            // Filter out things that are not measure bars (like long stems),
            // etc... We do this by computing the median height vertical
            // bar and discarding any bar that differes by a height of more
            // than 5.
            ////////////////////////////////////////////////////////////      
            const calculateMedian = (array) => {
                const sortedArray = array.slice().sort((a, b) => a - b);
                const middle = Math.floor(sortedArray.length / 2);

                if (sortedArray.length % 2 === 0) {
                    // If the array has an even number of elements, take the average of the middle two
                    return (sortedArray[middle - 1] + sortedArray[middle]) / 2;
                } else {
                    // If the array has an odd number of elements, return the middle element
                    return sortedArray[middle];
                }
            };

            // Calculate the median height of contours
            const heights = filteredContours.map((contour) => window.cv.boundingRect(contour).height);
            const median = calculateMedian(heights);

            // Define a tolerance threshold (adjust as needed)
            const tolerance = 5;

            // Filter the contours based on height and median
            filteredContours = filteredContours.filter((contour) => {
                const height = window.cv.boundingRect(contour).height;
                return Math.abs(height - median) <= tolerance;
            });

            ////////////////////////////////////////////////////////////
            // Sort the bars from left to right and top to bottom, taking into
            // account the possibility of slightly different y-coordinates for
            // bars on the same staff horizontally.
            ////////////////////////////////////////////////////////////

            // Define a function to group contours by height with a tolerance
            function groupContoursByY(contours, tolerance) {
                const localGroupedContours = [];
                for (const contour of contours) {
                    const y = window.cv.boundingRect(contour).y;

                    // Check if there's a group with a similar height
                    let foundGroup = false;
                    for (const group of localGroupedContours) {
                        const groupY = window.cv.boundingRect(group[0]).y;
                        if (Math.abs(y - groupY) <= tolerance) {
                            group.push(contour);
                            foundGroup = true;
                            break;
                        }
                    }

                    // If no similar group is found, create a new group
                    if (!foundGroup) {
                        localGroupedContours.push([contour]);
                    }
                }

                return localGroupedContours;
            }

            // Group contours by y-coordinate with a tolerance of 5
            const groupedContours = groupContoursByY(filteredContours, 5);

            // Sort each group of contours by x-coordinate
            for (let group of groupedContours) {
                group.sort((contour1, contour2) => {
                    const rect1 = window.cv.boundingRect(contour1);
                    const rect2 = window.cv.boundingRect(contour2);
                    return rect2.x - rect1.x;
                });
                group = filterContoursByDistance(group);
            }

            ////////////////////////////////////////////////////////////
            // Convert groupedContours into rectangular regions, i.e. measures!
            ////////////////////////////////////////////////////////////
            const measureRectangles = groupedContours.map((group) => {
                // Create an array of measure rectangles in this group
                const groupRectangles = [];
                for (let i = 0; i < group.length - 1; i++) {
                    const rectA = window.cv.boundingRect(group[i]);
                    const rectB = window.cv.boundingRect(group[i + 1]);
                    const measureRect = {
                        x: rectA.x,
                        y: rectA.y,
                        width: rectB.x + rectB.width - rectA.x,
                        height: rectA.height, // Assuming all contours in the same group have the same height
                    };
                    groupRectangles.push(measureRect);
                }
                return groupRectangles;
            });

            const allMeasures = [].concat(...measureRectangles).reverse();

            console.log(allMeasures.length.toString() + " measures across " + measureRectangles.length.toString() + " lines");

            // Create a canvas to show the result
            let canvasElement = document.getElementById(`canvas-${index}`);
            const ctx = canvasElement.getContext('2d');
            window.cv.imshow(canvasElement, src);

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

            // Cleanup the memory
            src.delete(); gray.delete(); edges.delete();
        } else {
            console.error('Please make sure OpenCV.js is loaded before calling this function.');
        }
    };

    const hideMeasure = (canvasElement, x1, x2, y1, y2) => {
        // Implement animated gradient blur to hide the measure
        // You can use HTML5 Canvas APIs for this, such as creating a gradient and applying it as a mask
        // Here's where you can add the code to gradually hide the measure based on metronome settings (bpm)
        // You may need to use requestAnimationFrame for smooth animation
        // Example code:
        // const ctx = canvasElement.getContext('2d');
        // const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        // gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        // gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');
        // ctx.fillStyle = gradient;
        // ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        // ...
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

// Function to calculate the distance between two contours
function calculateDistance(contour1, contour2) {
    const rect1 = window.cv.boundingRect(contour1);
    const rect2 = window.cv.boundingRect(contour2);
    const centerX1 = rect1.x + rect1.width / 2;
    const centerY1 = rect1.y + rect1.height / 2;
    const centerX2 = rect2.x + rect2.width / 2;
    const centerY2 = rect2.y + rect2.height / 2;
    return Math.sqrt(Math.pow(centerX1 - centerX2, 2) + Math.pow(centerY1 - centerY2, 2));
}

// Function to filter contours by minimum distance, keeping at least one contour in each group
function filterContoursByDistance(contours, minDistance) {
    const filteredContours = [];
    for (let i = 0; i < contours.length; i++) {
        const contour1 = contours[i];
        let keep = true;
        for (let j = 0; j < filteredContours.length; j++) {
            const contour2 = filteredContours[j];
            const distance = calculateDistance(contour1, contour2);
            if (distance < minDistance) {
                keep = false;
                break;
            }
        }
        if (keep) {
            filteredContours.push(contour1);
        }
    }
    return filteredContours;
}


export default App;
