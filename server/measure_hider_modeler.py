from flask import Flask, request, jsonify, send_from_directory
import base64
import io
import os
import cv2
import numpy as np
import torch
from PIL import Image
import torchvision.models.detection as detection_models
from torchvision.models.detection import fasterrcnn_resnet50_fpn
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor

app = Flask(__name__)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

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
    data = request.json.get('imageData')

    # Decode the image data URL
    header, encoded = data.split(",", 1)
    image_data = base64.b64decode(encoded)

    # Convert to an image and then to a format your model can process
    image = Image.open(io.BytesIO(image_data))
    image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)

    # Now you can use your existing image processing logic
    # For example, using test_model_on_image function (or similar)
    rectangles = run_model_on_image(image)  # Replace with the correct function call

    # Return the array of rectangles
    return jsonify(rectangles)

def create_model():
    model = fasterrcnn_resnet50_fpn(weights=detection_models.FasterRCNN_ResNet50_FPN_Weights.DEFAULT)
    num_classes = 2  # 1 class (measure) + background
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)

    model = model.to(DEVICE)
    return model

def run_model_on_image(image):
    """
    Test the model on a specific image and output the bounding boxes.
    """
    # Calculate padding to reach 1200x1200
    image_height, image_width = image.shape
    padding_right = max(0, 1200 - image_width)
    padding_bottom = max(0, 1200 - image_height)

    # Convert image to PyTorch tensor and pad
    image = torch.tensor(image, dtype=torch.float32).unsqueeze(0)
    image = torch.nn.functional.pad(image, (0, padding_right, 0, padding_bottom), 'constant', 0)

    # Load and configure the model
    model = create_model()
    model.load_state_dict(torch.load(f'model.RCNN.20.pth', map_location=DEVICE))
    model.eval()  # Set the model to evaluation mode

    # Convert grayscale image to 3-channel image
    img_3channel = image.repeat(3, 1, 1)  # Repeat the channel 3 times

    # Wrap the image in a list and move to device
    img_list = [img_3channel.to(DEVICE)]

    # Run the model
    with torch.no_grad():
        prediction = model(img_list)

    # Convert boxes to HTML rect format and to Python list
    rects = []
    for box in prediction[0]['boxes']:
        # Convert tensor to numpy array
        numpy_box = box.cpu().numpy()
        # Convert (x1, y1, x2, y2) to (x, y, width, height)
        x, y, x2, y2 = numpy_box
        width = x2 - x
        height = y2 - y
        numpy_box = box.cpu().numpy()
        x, y, x2, y2 = numpy_box
        width = x2 - x
        height = y2 - y

        # Convert numpy floats to Python floats
        rect = [float(x), float(y), float(width), float(height)]
        rects.append(rect)

    # Note these are all coordinates, not x,y,width,height
    return rects

if __name__ == '__main__':
    app.run(debug=True)
