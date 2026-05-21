import { useEffect, useRef, useState } from "react";
import { TouchableOpacity, View, StyleSheet, Text, Image } from "react-native";
import { CameraSession, NativePreviewView, useCameraDevice, useCameraPermission, VisionCamera } from "react-native-vision-camera";
import { initLlama, LlamaContext } from "llama.rn";
import { File, Paths } from "expo-file-system";
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

/* eslint-disable @typescript-eslint/no-require-imports */
const modelRequireHandle = require("../assets/models/SmolVLM2-256M-Video-Instruct-Q8_0.gguf");
const mmprojRequireHandle = require("../assets/models/mmproj-SmolVLM2-256M-Video-Instruct-Q8_0.gguf");
/* eslint-disable @typescript-eslint/no-require-imports */


export function StaticObjectScanner() {

    const { hasPermission, requestPermission } = useCameraPermission();
    const device = useCameraDevice('back');

    const previewOutputRef = useRef<any>(null);
    const sessionRef = useRef<CameraSession | null>(null);
    const photoOutputRef = useRef<any>(null);

    const [context, setContext] = useState<LlamaContext | null>(null);
    const [result, setResult] = useState('Loading local AI model...');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [sessionReady, setSessionReady] = useState(false);

    useEffect(() => {
        if (!hasPermission) {
            requestPermission();
        }
    }, [hasPermission, requestPermission]);

    useEffect(() => {
        if (!hasPermission || !device) return;

        const setupSession = async () => {
            try {
                const previewOutput = VisionCamera.createPreviewOutput();
                previewOutputRef.current = previewOutput;

                const photoOutput = VisionCamera.createPhotoOutput({
                    targetResolution: { width: 1280, height: 720 },
                    containerFormat: 'jpeg',
                    quality: 0.9,
                    qualityPrioritization: 'quality',
                });
                photoOutputRef.current = photoOutput;

                const session = await VisionCamera.createCameraSession(false);
                sessionRef.current = session;

                await session.configure([
                    {
                        input: device,
                        outputs: [
                            { output: previewOutput, mirrorMode: 'auto' },
                            { output: photoOutput, mirrorMode: 'auto' },
                        ],
                        constraints: []
                    }
                ], {});

                await session.start();
                setSessionReady(true);
            } catch (error: any) {
                setResult(`Camera session error: ${error.message}`);
            }
        };

        setupSession();

        return () => {
            sessionRef.current?.stop();
            sessionRef.current?.dispose();
            sessionRef.current = null;
        };
    }, [hasPermission, device]);

    useEffect(() => {
        const loadLocalModel = async () => {
            try {

                const localModelFile = new File(Paths.document, 'model.gguf');
                const localMmprojFile = new File(Paths.document, 'mmproj.gguf');

                if (!localModelFile.exists) {
                    setResult('Copying model to device storage...');
                    const modelAsset = await Asset.fromModule(modelRequireHandle).downloadAsync();
                    const modelSrcFile = new File(modelAsset.localUri!);
                    modelSrcFile.copy(localModelFile);
                }

                if (!localMmprojFile.exists) {
                    setResult('Copying mmproj to device storage...');
                    const mmprojAsset = await Asset.fromModule(mmprojRequireHandle).downloadAsync();
                    const mmprojSrcFile = new File(mmprojAsset.localUri!);
                    mmprojSrcFile.copy(localMmprojFile);
                }

                const llamaContext = await initLlama({
                    model: localModelFile.uri,
                    n_ctx: 2048,
                });

                const multimodalReady = await llamaContext.initMultimodal({
                    path: localMmprojFile.uri,
                });

                if (!multimodalReady) {
                    setResult('Failed to initialize local vision support.');
                    return;
                }

                setContext(llamaContext);
                setResult('AI Model Ready. Take a photo to recognize objects!');
            } catch (error: any) {
                setResult(`Error loading local model: ${error.message}`);
            }
        };

        loadLocalModel();
    }, []);

    const captureAndRecognize = async () => {
        if (!context || !photoOutputRef.current || !sessionReady) return;

        try {
            setIsAnalyzing(true);
            setResult('Analyzing image completely offline...');

            const { filePath } = await photoOutputRef.current.capturePhotoToFile({}, {});
            await sessionRef.current?.stop();
            setSessionReady(false);

            const timestamp = Date.now();
            const destPath = FileSystem.documentDirectory + `capture_${timestamp}.jpg`;
            await FileSystem.copyAsync({
                from: `file://${filePath}`,
                to: destPath,
            });

            const cleanDest = destPath.startsWith('file://') ? destPath.slice(7) : destPath;
            setPhotoUri(destPath);

            const response = await context.completion({
                prompt: `What objects do you see in this image? <__media__>`,
                media_paths: [cleanDest],
                temperature: 0.1,
                n_predict: 512,        
                stop: ['</s>']
            });

            setResult(response.text.trim());
        } catch (error: any) {
            setResult(`Analysis failed: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (!hasPermission) {
        return (
            <View style={styles.container}>
                <Text style={{ color: '#fff', textAlign: 'center', marginTop: 40 }}>
                    Camera permission required.
                </Text>
                <TouchableOpacity onPress={requestPermission} style={styles.button}>
                    <Text style={styles.btnText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!device) return <Text>Camera hardware not found.</Text>;

    return (
        <View style={styles.container}>
            {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.viewer} />
            ) : previewOutputRef.current ? (
                <NativePreviewView
                    previewOutput={previewOutputRef.current}
                    style={styles.viewer}
                />
            ) : (
                <View style={[styles.viewer, { backgroundColor: '#000' }]} />
            )}

            <View style={styles.uiBox}>
                <Text style={styles.statusText}>{result}</Text>

                {photoUri ? (
                    <TouchableOpacity style={styles.button} onPress={async () => {
                        try {
                            if (photoUri) {
                                await FileSystem.deleteAsync(photoUri, { idempotent: true });
                            }
                            setPhotoUri(null);

                            await sessionRef.current?.start();
                            setSessionReady(true);
                        } catch (error: any) {
                            setResult(`Retake failed: ${error.message}`);
                        }
                    }}>
                        <Text style={styles.btnText}>Retake Photo</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={[styles.button, isAnalyzing && { backgroundColor: '#ccc' }]}
                        onPress={captureAndRecognize}
                        disabled={isAnalyzing}
                    >
                        <Text style={styles.btnText}>{isAnalyzing ? 'Scanning...' : 'Capture Image'}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    viewer: { flex: 3 },
    uiBox: { flex: 1.5, backgroundColor: '#fff', padding: 20, alignItems: 'center', justifyContent: 'center' },
    statusText: { fontSize: 16, textAlign: 'center', color: '#333', marginBottom: 20 },
    button: { backgroundColor: '#007AFF', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 25 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});