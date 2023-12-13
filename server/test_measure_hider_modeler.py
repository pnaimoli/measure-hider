import unittest
import json
from measure_hider_modeler import app

class MeasureHiderModelerTestCase(unittest.TestCase):

    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def test_process_image(self):
        # Load image data from the file
        with open('test_image.data', 'r') as file:
            image_data = file.read()

        # Example test for the /process-image route
        test_data = {'imageData': image_data}  # replace with your test data URL
        response = self.app.post('/process-image', data=json.dumps(test_data), content_type='application/json')
        self.assertEqual(response.status_code, 200)

        # Additional assertions to verify the response data can be added here
        # For example:
        data = json.loads(response.get_data(as_text=True))
        self.assertEqual(len(data), 31)

if __name__ == '__main__':
    unittest.main()
