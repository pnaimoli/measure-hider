#!/usr/local/bin/bash

mkdir -p build
cd client && npm run build; cd ..
mkdir -p build/static
rm -rf build/static/*
cp -r client/build/* build/static/
cp -p server/{measure_hider_modeler.py,model.pt,requirements.txt,wsgi.py} build/
