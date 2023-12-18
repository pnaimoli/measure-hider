"""Module for Flask app to process images using YOLOv8."""

import base64
import io
import os
from flask import Flask, request, jsonify, send_from_directory
from PIL import Image
from ultralytics import YOLO

app = Flask(__name__, static_folder='client')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    """
    Serve files from the static folder or 'index.html' for the root path.

    If the root path '/' is accessed, 'index.html' is returned. If a specific path is
    requested, the function checks if the file exists in the static folder. If the file
    exists, it is returned; otherwise, a 404 error is raised.

    Args:
    path (str): The requested path.

    Returns:
    Response: A Flask response object to serve the requested file or 'index.html' for the
              root path. Returns a 404 error response if the file does not exist.
    """
    if path == "":
        # Return 'index.html' for the root path
        return send_from_directory(app.static_folder, 'index.html')
    if os.path.exists(os.path.join(app.static_folder, path)):
        # Return the requested file if it exists
        return send_from_directory(app.static_folder, path)
    # Return a 404 error if the file does not exist
    return "Not Found", 404

@app.route('/process-image', methods=['POST'])
def process_image():
    """
    Process an image sent in the request and predict bounding boxes using YOLO model.

    The function expects a POST request with a JSON body containing a base64-encoded
    image data URL. It decodes the image, uses the YOLO model to predict bounding boxes,
    and returns these coordinates in a JSON format.

    Returns:
    Response: A Flask response object containing JSON data with the bounding box
              coordinates for each detected measure in the image.
    """
    # Extract the image data URL from the request
    image_data_url = request.json.get('imageData')
    _, encoded = image_data_url.split(",", 1) # _ = header
    image_data = base64.b64decode(encoded)
    image = Image.open(io.BytesIO(image_data))

    current_script_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(current_script_dir, 'model.pt')
    model = YOLO(model_path)
    results = model(image, verbose=False)[0]  # predict on an image

    # Convert the tensor to a list for JSON serialization
    predictions = []
    for box in results.boxes.xyxy.cpu().numpy():
        left_x, top_y, right_x, bottom_y = map(float, box[:4])
        predictions.append({"x": left_x, "y": top_y, "w": right_x-left_x, "h": bottom_y-top_y})

    return jsonify(predictions)

if __name__ == '__main__':
    # Airplay Receiver is using localhost:5000 for whatever reason.
    app.run('localhost', 4999, debug=True)
