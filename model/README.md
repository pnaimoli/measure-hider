# Measure Detection Modeler

This project includes a machine learning model for detecting musical measures in sheet music images. It utilizes PyTorch for model training and evaluation and supports conversion to ONNX format for broader compatibility.

## Features

- Training a Faster R-CNN model for measure detection in sheet music.
- Evaluating the model on individual images.
- Converting the trained model to ONNX format.
- Custom dataset handling for training and evaluation.

## Requirements

- Python 3.x
- PyTorch
- OpenCV (cv2)
- ONNX Runtime
- PIL
- Matplotlib
- tqdm
- omrdatasettools

## Installation

Before running the script, ensure that you have all the required packages installed. You can install them using pip:

```bash
pip install torch torchvision opencv-python onnxruntime pillow matplotlib tqdm
```

## Usage

### Training the Model

To train the model, run the script with the desired number of epochs:
```bash
python make_model.py --epochs 5
```

### Testing the Model

To test the model on an image:
```bash
python make_model.py --epochs 5 --image path_to_your_image.png
```

### Converting to ONNX Format

To convert the trained model to ONNX format;
```bash
python make_model.py --epochs 5 --onnx
```

## Dataset

The model expects a dataset of images and corresponding JSON annotations for training. The dataset is automatically downloaded and prepared using the ```omrdatasettools``` package.

## Model Details

- The model is based on Faster R-CNN with a ResNet-50 FPN backbone.
- The input images are resized to 1200x1200 pixels with padding as needed.
- Annotations are expected in JSON format with bounding box information.

## Cleaning up the model

To remove model warnings, run:

onnxruntime/onnxruntime/python/tools/transformers/optimizer.py --opt_level 2 --input ./model.RCNN.12.onnx --output ../public/model.RCNN.12.onnx
