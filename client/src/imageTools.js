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
