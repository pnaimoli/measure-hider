import argparse
import json
import os
import cv2
import torch
import numpy as np
from PIL import Image
from torch.utils.data import DataLoader, Dataset
import torchvision.models.detection as detection_models
from torchvision.models.detection import fasterrcnn_resnet50_fpn
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision import transforms
from torch.optim import Adam
from tqdm import tqdm
from omrdatasettools import Downloader, OmrDataset
import matplotlib.pyplot as plt
import matplotlib.patches as patches

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

class AudioLabsDataset(Dataset):
    """
    Dataset class for AudioLabs data.
    """
    def __init__(self, root_dir):
        self.root_dir = root_dir
        self.data = []
        self.memoized_data = {}  # Dictionary for memoization

        for subdir in os.listdir(root_dir):
            img_dir = os.path.join(root_dir, subdir, "img")
            json_dir = os.path.join(root_dir, subdir, "json")

            if os.path.isdir(img_dir) and os.path.isdir(json_dir):
                for fname in os.listdir(img_dir):
                    if fname.endswith('.png'):
                        image_path = os.path.join(img_dir, fname)
                        json_path = os.path.join(json_dir, fname.replace('.png', '.json'))

                        if os.path.exists(json_path):
                            self.data.append((image_path, json_path))

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        if idx in self.memoized_data:
            return self.memoized_data[idx]

        image_path, json_path = self.data[idx]

        # Load image
        image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        image_height, image_width = image.shape

        # Calculate padding to reach 1200x1200
        padding_right = max(0, 1200 - image_width)
        padding_bottom = max(0, 1200 - image_height)

        # Convert image to PyTorch tensor and pad
        image = torch.tensor(image, dtype=torch.float32).unsqueeze(0)
        image = torch.nn.functional.pad(image, (0, padding_right, 0, padding_bottom), 'constant', 0)

        # Load JSON data
        with open(json_path, 'r') as file:
            annotation_data = json.load(file)

        # Prepare targets
        boxes = []
        for measure in annotation_data["system_measures"]:
            x_min = measure["left"]
            y_min = measure["top"]
            x_max = x_min + measure["width"]
            y_max = y_min + measure["height"]
            boxes.append([x_min, y_min, x_max, y_max])

        if len(boxes) == 0:
            # Provide an empty tensor with shape [0, 4] for no measures
            boxes = torch.zeros((0, 4), dtype=torch.float32)

        boxes = torch.as_tensor(boxes, dtype=torch.float32)
        labels = torch.ones((len(boxes),), dtype=torch.int64)  # Assuming all are 'measure' class

        targets = {}
        targets["boxes"] = boxes
        targets["labels"] = labels

        # Store in the memoization dictionary
        self.memoized_data[idx] = (image, targets)

        return image, targets

def collate_fn(batch):
    """
    Custom collate function for DataLoader.
    """
    images, targets = zip(*batch)

    # Stack images into a single tensor
    images = torch.stack(images, 0)

    # Targets need not be stacked; a list of dictionaries is fine
    targets = [{k: torch.as_tensor(v) for k, v in t.items()} for t in targets]

    return images, targets

def train(model, data_loader, epochs):
    """
    Training loop for the model.
    """
    optimizer = Adam(model.parameters(), lr=0.0005)
    for epoch in range(epochs):
        print(f'Epoch {epoch}...')
        model.train()
        for images, targets in tqdm(data_loader):
            images = list(image.to(DEVICE) for image in images)
            targets = [{k: v.to(DEVICE) for k, v in t.items()} for t in targets]

            loss_dict = model(images, targets)
            losses = sum(loss for loss in loss_dict.values())

            optimizer.zero_grad()
            losses.backward()
            optimizer.step()

def create_model():
    model = fasterrcnn_resnet50_fpn(weights=detection_models.FasterRCNN_ResNet50_FPN_Weights.DEFAULT)
    num_classes = 2  # 1 class (measure) + background
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)

    model = model.to(DEVICE)
    return model

def test_model_on_image(epochs, image_path):
    """
    Test the model on a specific image and output the bounding boxes.
    """
    # Load and preprocess the image using OpenCV
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    image_height, image_width = image.shape

    # Calculate padding to reach 1200x1200
    padding_right = max(0, 1200 - image_width)
    padding_bottom = max(0, 1200 - image_height)

    # Convert image to PyTorch tensor and pad
    image = torch.tensor(image, dtype=torch.float32).unsqueeze(0)
    image = torch.nn.functional.pad(image, (0, padding_right, 0, padding_bottom), 'constant', 0)

    # Load and configure the model
    model = create_model()
    model.load_state_dict(torch.load(f'model.RCNN.{epochs}.pth', map_location=DEVICE))
    model.eval()  # Set the model to evaluation mode

    # Convert grayscale image to 3-channel image
    img_3channel = image.repeat(3, 1, 1)  # Repeat the channel 3 times

    # Wrap the image in a list and move to device
    img_list = [img_3channel.to(DEVICE)]

    # Run the model
    with torch.no_grad():
        prediction = model(img_list)

    # Convert the tensor to a PIL Image for visualization
    img_pil = transforms.ToPILImage()(image.squeeze(0).cpu())  # Remove batch dimension and convert to CPU

    # Visualization
    fig, ax = plt.subplots(1)
    ax.imshow(img_pil.convert("RGB"))  # Convert to RGB for display

    for element in prediction[0]['boxes']:
        box = element.cpu().numpy()
        rect = patches.Rectangle((box[0], box[1]), box[2] - box[0], box[3] - box[1], linewidth=1, edgecolor='r', facecolor='none')
        ax.add_patch(rect)

    plt.show()

def train_mode(epochs):
    """
    Main function to execute the model training.
    """
    # Download and extract dataset
    downloader = Downloader()
    downloader.download_and_extract_dataset(OmrDataset.AudioLabs_v2, "./data")

    # Initialize dataset and DataLoader
    audiolabs_dataset = AudioLabsDataset('./data')
    data_loader = DataLoader(audiolabs_dataset, batch_size=4, shuffle=True, collate_fn=collate_fn)

    # Train the model
    model = create_model()
    train(model, data_loader, epochs)

    # Save the model
    torch.save(model.state_dict(), f'model.RCNN.{epochs}.pth')

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Train a model for measure detection')
    parser.add_argument('--epochs', type=int, default=2, help='Number of training epochs')
    parser.add_argument('--image', type=str, help='Path to an image file for testing the model')
    args = parser.parse_args()

    if args.image:
        test_model_on_image(args.epochs, args.image)
    else:
        train_mode(args.epochs)
