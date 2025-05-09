.PHONY: build clean

CLIENT_DIR := client
BUILD_DIR := build
SERVER_DIR := server

build: clean
	mkdir -p $(BUILD_DIR)/client

	cd $(CLIENT_DIR) && npm install --no-audit --no-fund
	cd $(CLIENT_DIR) && npm run build

	cp -r $(CLIENT_DIR)/build/* $(BUILD_DIR)/client/
	cp -p $(SERVER_DIR)/{measure_hider_modeler.py,model.pt,requirements.txt,wsgi.py,gunicorn_config.py} $(BUILD_DIR)/

clean:
	rm -rf $(BUILD_DIR)

