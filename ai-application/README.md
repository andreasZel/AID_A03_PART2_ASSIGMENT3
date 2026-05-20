# AIDL A03 Assigment 3

## Student: Zelios Andreas mscaidl-0142

## Process to implement

1. Create the basic react native application:

      ```bash
      npx create-expo-app ai-application
      ```

2. install necessary packages

      we want the packages `llama.rn` and `react-native-vision-camera`, we 
      install them using npm

      ```bash
      npm install llama.rn --ignore-scripts
      npm install react-native-vision-camera
      ```

3. add plugin in `app.json` as described [npm package](https://www.npmjs.com/package/llama.rn)

      ```json
      "plugins": [
            ...,
            {
            "enableEntitlements": true,
            "entitlementsProfile": "production",
            "forceCxx20": true,
            "enableOpenCL": true
            }
         ],
      ```

4. install the models that ollama will use, download from [here](https://huggingface.co/ggml-org/SmolVLM2-256M-Video-Instruct-GGUF/blob/main/SmolVLM2-256M-Video-Instruct-Q8_0.gguf) and [here](https://huggingface.co/ggml-org/SmolVLM2-256M-Video-Instruct-GGUF/blob/main/mmproj-SmolVLM2-256M-Video-Instruct-Q8_0.gguf).