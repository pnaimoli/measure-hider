"""
Unit tests for the Measure Hider Modeler Flask application.

This module contains unit tests for testing the functionality of
the Measure Hider Modeler Flask application, particularly focusing
on the image processing capabilities.
"""

import unittest
import json
from measure_hider_modeler import app

class MeasureHiderModelerTestCase(unittest.TestCase):
    """
    Test case for the Measure Hider Modeler Flask application.

    This class implements unittest.TestCase and contains tests for
    verifying the functionality of the Measure Hider Modeler Flask
    application, including the processing of images.
    """

    def setUp(self):
        """
        Set up test client for Flask application.

        Initializes a test client for the Flask application and sets
        the testing flag to True.
        """
        self.app = app.test_client()
        self.app.testing = True

    def test_process_image(self):
        """
        Test the image processing endpoint of the Flask application.

        This test verifies that the /process-image route correctly processes
        an image provided in the request. It checks the status code of the
        response and the length of the data returned to ensure correct
        functionality.
        """
        # Load image data from the file
        with open('test_image.data', 'r', encoding='utf-8') as file:
            image_data = file.read()

        # Example test for the /process-image route
        test_data = {'imageData': image_data}  # replace with your test data URL
        response = self.app.post('/process-image',
                                 data=json.dumps(test_data),
                                 content_type='application/json')
        self.assertEqual(response.status_code, 200)

        # Additional assertions to verify the response data can be added here
        # For example:
        data = json.loads(response.get_data(as_text=True))
        self.assertEqual(len(data), 31)

if __name__ == '__main__':
    unittest.main()
