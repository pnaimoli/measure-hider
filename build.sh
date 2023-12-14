#!/usr/local/bin/bash

set -e

mkdir -p build

cd client
npm install --no-audit --no-fund
npm run build
cd ..

mkdir -p build/client
rm -rf build/client/*
cp -r client/build/* build/client/
cp -p server/{measure_hider_modeler.py,model.pt,requirements.txt,wsgi.py} build/
