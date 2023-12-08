import os
import json
import shutil
import yaml
from sklearn.model_selection import train_test_split
from PIL import Image

def convert_to_yolo_format(data, img_width, img_height):
    # Assuming 'system_measures' is the only class and its class id is 0
    yolo_data = []
    for obj in data['system_measures']:
        x_center = (obj['left'] + obj['width'] / 2) / img_width
        y_center = (obj['top'] + obj['height'] / 2) / img_height
        width = obj['width'] / img_width
        height = obj['height'] / img_height
        yolo_data.append(f'0 {x_center} {y_center} {width} {height}')
    return yolo_data

def strip_icc_profile(source_path, destination_path):
    with Image.open(source_path) as img:
        # Convert to RGB if the image is in P mode (palette-based)
        if img.mode in ["P", "RGBA"]:
            img = img.convert("RGB")

        # Save the image without ICC profile at the destination path
        img.save(destination_path, 'PNG', icc_profile=None)

def process_dataset(root_dir, output_dir):
    # Create train and val directories with images and labels subdirectories
    train_images_dir = os.path.join(output_dir, 'train/images')
    train_labels_dir = os.path.join(output_dir, 'train/labels')
    val_images_dir = os.path.join(output_dir, 'val/images')
    val_labels_dir = os.path.join(output_dir, 'val/labels')

    os.makedirs(train_images_dir, exist_ok=True)
    os.makedirs(train_labels_dir, exist_ok=True)
    os.makedirs(val_images_dir, exist_ok=True)
    os.makedirs(val_labels_dir, exist_ok=True)

    all_images = []
    for subdir in os.listdir(root_dir):
        img_dir = os.path.join(root_dir, subdir, "img")
        json_dir = os.path.join(root_dir, subdir, "json")

        if os.path.isdir(img_dir) and os.path.isdir(json_dir):
            for fname in os.listdir(img_dir):
                if fname.endswith('.png'):
                    image_path = os.path.join(img_dir, fname)
                    json_path = os.path.join(json_dir, fname.replace('.png', '.json'))

                    if os.path.exists(json_path):
                        with open(json_path, 'r') as file:
                            data = json.load(file)
                            yolo_data = convert_to_yolo_format(data, data['width'], data['height'])

                        # Save YOLO formatted label file
                        label_fname = fname.replace('.png', '.txt')
                        yolo_label_path = os.path.join(output_dir, label_fname)
                        with open(yolo_label_path, 'w') as file:
                            file.write('\n'.join(yolo_data))

                        all_images.append((image_path, yolo_label_path))

    # Split data into train and val sets
    train_set, val_set = train_test_split(all_images, test_size=0.2, random_state=42)

    # Move files into the respective train/val directories
    for img_path, label_path in train_set:
        new_image_path = os.path.join(train_images_dir, os.path.basename(img_path))
        strip_icc_profile(img_path, new_image_path)
        shutil.copy(label_path, train_labels_dir)
        os.remove(label_path)

    for img_path, label_path in val_set:
        new_image_path = os.path.join(val_images_dir, os.path.basename(img_path))
        strip_icc_profile(img_path, new_image_path)
        shutil.copy(label_path, val_labels_dir)
        os.remove(label_path)

    return len(train_set), len(val_set)

def create_data_yaml(dataset_dir, num_classes, class_names):
    yaml_content = {
        'train': os.path.join(dataset_dir, 'train/images'),
        'val': os.path.join(dataset_dir, 'val/images'),
        'nc': num_classes,
        'names': class_names
    }
    with open(os.path.join('.', 'data.yaml'), 'w') as file:
        yaml.dump(yaml_content, file)

# Main function
def main():
    root_dir = './AudioLabs_v2'  # Path to your original dataset
    output_dir = './datasets/AudioLabs_v2'  # Path to output the formatted dataset
    num_train, num_val = process_dataset(root_dir, output_dir)

    # Assuming 'system_measures' is the only class
    create_data_yaml(os.path.split(output_dir)[-1], num_classes=1, class_names=['system_measures'])

    print(f"Dataset prepared: {num_train} training samples, {num_val} validation samples")
    print(f"data.yaml file created at {output_dir}")

if __name__ == "__main__":
    main()
