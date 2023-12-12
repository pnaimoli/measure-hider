from flask import Flask, request, jsonify, send_from_directory
import base64
import io
import os
#import numpy as np
from PIL import Image
from ultralytics import YOLO

app = Flask(__name__)

@app.route('/')
def index():
    return '''
    <html>
        <head>
            <title>Measure Hider Modeler</title>
        </head>
        <body>
            <h1>Welcome to Measure Hider Modeler</h1>
            <p>This is a test page for the Measure Hider Modeler application.</p>
        </body>
    </html>
    '''

@app.route('/measure-hider/', defaults={'path': ''})
@app.route('/measure-hider/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

@app.route('/measure-hider/process-image', methods=['POST'])
def process_image():
    # Extract the image data URL from the request
    image_data_url = request.json.get('imageData')
    header, encoded = image_data_url.split(",", 1)
    image_data = base64.b64decode(encoded)
    image = Image.open(io.BytesIO(image_data))

    model = YOLO("model.pt")
    results = model(image, verbose=False)[0]  # predict on an image

    # Convert the tensor to a list for JSON serialization
    predictions = []
    for box in results.boxes.xyxy.cpu().numpy():
        x, y, x1, y1 = map(float, box[:4]) # Extract bounding box coordinates
        predictions.append({"x": x, "y": y, "w": x1-x, "h": y1-y})

    return jsonify(predictions)

if __name__ == '__main__':
    app.run(debug=True)
