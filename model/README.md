# Measure Detection Modeling Program

## Introduction
This repository contains the source code and instructions for creating a measure detection model. Our aim is to provide an efficient solution for detecting and analyzing measures in musical compositions using advanced machine learning techniques.

# Purpose
The primary purpose of this program is to automate the process of detecting measures in music sheets, facilitating the parent project [Measure Hider](http://github.com/pnaimoli/measure-hider).

# Algorithm Used
Our project utilizes the YOLO (You Only Look Once) algorithm, specifically the [YOLOv8](https://github.com/ultralytics/ultralytics) architecture. This choice is due to its proven efficiency and accuracy in real-time object detection tasks.

# Datasets
We use the AudioLabs Dataset v2 for training our model. AudioLabs v2 contains sheet music pre-labeled with 24,186 bounding boxes for system measures, which is exactly what we're trying to detect.

# Installation and Setup
To get started with the program, follow these steps:

## Download the dataset:
    ```bash
    curl -O https://github.com/apacha/OMR-Datasets/releases/download/datasets/AudioLabs_v2.zip
    ```

## Create a directory and unzip the dataset:
    ```bash
    mkdir -p AudioLabs_v2
    mv AudioLabs_v2.zip AudioLabs_v2/
    cd AudioLabs_v2 && unzip AudioLabs_v2.zip && cd ..
    ```

## Prepare the dataset:
    ```bash
    python3 prepare_dataset.py
    ```
This helper script formats the dataset to be compatible with the YOLO algorithm. It organizes images and annotations in the structure YOLO expects, ensuring smooth training and validation processes.

## Configure YOLO directories.
Before training the model, ensure the YOLO settings in data.yaml are modified to point to the current directory for runs, weights, and datasets. This step is crucial for the correct functioning of the model training process.  To view/modify YOLO settings you can use the command
    ```bash
    yolo settings
    ```

# Usage
To train the model, use the following command:
    ```bash
    yolo train data=data.yaml model=yolov8n.pt epochs=12 lr0=0.01
    ```
This example training command involves 12 epochs with an initial learning rate of 0.01. Adjust the parameters as needed to suit your specific requirements, but these seem to work well.
