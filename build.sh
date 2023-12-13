#!/usr/local/bin/bash

mkdir -p build
cd client && npm run build; cd ..
mkdir -p build/client
rm -rf build/client/*
cp -r client/build/* build/client/
cp -p server/{measure_hider_modeler.py,model.pt,wsgi.py} build/
