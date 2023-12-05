import * as ort from 'onnxruntime-web';

export async function detectMeasuresOnnx(imageElement) {
    // Create an ONNX session
    const session = await ort.InferenceSession.create('/model.RCNN.12.onnx');

    // Preprocess the image to the format your model expects
    const preprocessedImage = preprocessImageForOnnx(imageElement);

    // Create a tensor from the preprocessed image
    const inputTensor = new ort.Tensor('float32', preprocessedImage.data, preprocessedImage.dims);

    // Run the model
    const output = await session.run({ 'images': inputTensor });

    // Process the output to extract bounding boxes
    const boundingBoxes = processOutputForOnnx(output);

    // Function to determine if two y-coordinates are close enough
    function areYCoordinatesClose(y1, y2, tolerance) {
        return Math.abs(y1 - y2) <= tolerance;
    }

    // Function to sort bounding boxes
    boundingBoxes.sort((a, b) => {
        // First, sort by y-coordinate (top to bottom)
        if (!areYCoordinatesClose(a.y, b.y, 10)) {
            return a.y - b.y;
        }

        // If y-coordinates are close, sort by x-coordinate (left to right)
        return a.x - b.x;
    });

    return boundingBoxes;
}

function preprocessImageForOnnx(imageElement) {
    // Convert the image to a Mat in OpenCV.js
    let mat = window.cv.imread(imageElement);

    // Convert to grayscale
    window.cv.cvtColor(mat, mat, window.cv.COLOR_RGBA2GRAY);

    // Create a new Mat for the padded image
    let paddedMat = new window.cv.Mat(1200, 1200, window.cv.CV_8UC1, new window.cv.Scalar(0));
    let roi = paddedMat.roi(new window.cv.Rect(0, 0, mat.cols, mat.rows));
    mat.copyTo(roi);
    roi.delete();
    mat.delete();

    // Convert the padded Mat to a Float32Array for ONNX
    let tensorData = new Float32Array(1200 * 1200 * 3); // for 3 channels
    for (let c = 0; c < 3; c++) { // for each channel
        for (let i = 0; i < 1200; i++) { // height
            for (let j = 0; j < 1200; j++) { // width
                let pixelValue = paddedMat.ucharAt(i, j); // Normalizing the pixel value
                let idx = c * 1200 * 1200 + i * 1200 + j; // Calculating the index in the 1D array
                tensorData[idx] = pixelValue;
            }
        }
    }
    paddedMat.delete();

    return {
        data: tensorData,
        type: 'float32',
        dims: [1, 3, 1200, 1200] // dimensions of the tensor
    };
}

function processOutputForOnnx(output) {
    // Assuming output is an array of tensors and the bounding boxes are in the last tensor
    const bboxTensor = output[3394]; // Huh?
    const boxes = bboxTensor.data;
    const numBoxes = bboxTensor.dims[0];

    let boundingBoxes = [];
    for (let i = 0; i < numBoxes; i++) {
        // Each box has 4 coordinates
        let box = boxes.slice(i * 4, (i + 1) * 4);
        boundingBoxes.push({
            x: box[0],
            y: box[1],
            width: box[2] - box[0],
            height: box[3] - box[1]
        });
    }

    return boundingBoxes;
}

export function deskew(imageElement) {
    if (typeof window.cv === 'undefined') {
        console.log.error('opencv.js is not loaded');
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageElement, 0, 0, imageElement.width, imageElement.height);

    let src = window.cv.imread(canvas);
    let dst = new window.cv.Mat();
    let gray = new window.cv.Mat();
    let lines = new window.cv.Mat();

    window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY, 0);
    window.cv.Canny(gray, gray, 50, 150, 3);

    // Detect lines
    window.cv.HoughLinesP(gray, lines, 1, Math.PI / 180, 100, 100, 10);

    // Calculate the angles of the lines
    let angles = [];
    for (let i = 0; i < lines.rows; ++i) {
        let startPoint = { x: lines.data32S[i * 4], y: lines.data32S[i * 4 + 1] };
        let endPoint = { x: lines.data32S[i * 4 + 2], y: lines.data32S[i * 4 + 3] };
        let angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x) * (180 / Math.PI);
        angles.push(angle);
    }

    // Compute the median angle
    angles.sort((a, b) => a - b);
    let medianAngle = angles[Math.floor(angles.length / 2)];

    // Rotate the image to deskew
    let center = new window.cv.Point(src.cols / 2, src.rows / 2);
    let rotationMatrix = window.cv.getRotationMatrix2D(center, medianAngle, 1);
    window.cv.warpAffine(src, dst, rotationMatrix, new window.cv.Size(src.cols, src.rows));

    // Update the image
    window.cv.imshow(canvas, dst);
    const deskewedDataUrl = canvas.toDataURL();

    // Clean up
    src.delete(); dst.delete(); gray.delete(); lines.delete();

    return deskewedDataUrl;
}

export function detectMeasures(imageElement) {
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
        window.cv.morphologyEx(gray, edges, window.cv.MORPH_OPEN, verticalKernel, new window.cv.Point(-1, -1), 2);

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

        // Group contours by y-coordinate with a tolerance of 5
        const groupedContours = groupContoursByY(filteredContours, 5);

        // Sort each group of contours by x-coordinate
        for (let i = 0; i < groupedContours.length; i++) {
            let group = groupedContours[i];
            group.sort((contour1, contour2) => {
                const rect1 = window.cv.boundingRect(contour1);
                const rect2 = window.cv.boundingRect(contour2);
                return rect2.x - rect1.x;
            });
            // Filter the group and update groupedContours at the same index
            groupedContours[i] = filterContoursByDistance(group, 20);
        }

        ////////////////////////////////////////////////////////////
        // Convert groupedContours into rectangular regions, i.e. measures!
        ////////////////////////////////////////////////////////////
        const measureRectangles = groupedContours.map((group) => {
            // Create an array of measure rectangles in this group
            const groupRectangles = [];
            for (let i = 0; i < group.length - 1; i++) {
                const rectB = window.cv.boundingRect(group[i]);
                const rectA = window.cv.boundingRect(group[i + 1]);
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

        // Cleanup the memory
        src.delete(); gray.delete(); edges.delete();

        // Finally collapse all the measures into a single list
        const allMeasures = [].concat(...measureRectangles).reverse();

        return allMeasures;
    } else {
        console.error('Please make sure OpenCV.js is loaded before calling this function.');
    }
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
