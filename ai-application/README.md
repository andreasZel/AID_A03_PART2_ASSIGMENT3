# AIDL A03 Assigment 3

## Student: Zelios Andreas mscaidl-0142

## Process to implement

1. Create the basic react native application:

      ```bash
      npx create-expo-app ai-application
      ```
2. update npm to latest version, or install it if you don't have it:

      ```bash
      npm install -g npm@latest
      ```
   
   and [node](https://nodejs.org/en/blog/release/v22.15.1) also

3. install necessary packages

      To install we have to use cmd, bash has a problem in windows, run

      ```bash
      set "TAR_OPTIONS=--force-local" && npm install
      ```

      set "TAR_OPTIONS=--force-local", treats everything locally, by default it tries to fetch
      network paths for some reason

4. install the models that ollama will use, download from [here](https://huggingface.co/ggml-org/SmolVLM2-256M-Video-Instruct-GGUF/blob/main/SmolVLM2-256M-Video-Instruct-Q8_0.gguf) and [here](https://huggingface.co/ggml-org/SmolVLM2-256M-Video-Instruct-GGUF/blob/main/mmproj-SmolVLM2-256M-Video-Instruct-Q8_0.gguf).

5. configure metro to handle the new extensions .gguf, by default it ignores it, run:

      ```bash
      npx expo customize metro.config.js
      ```

      this will create a metro.config.js file, add the following lines to it:

      ```javascript
      const config = getDefaultConfig(__dirname);

      config.resolver.assetExts.push('gguf'); // this one

      module.exports = config;
      ```

      