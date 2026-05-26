import { useEffect, useRef, useState } from "react";
import { TouchableOpacity, View, StyleSheet, Text, Image, Dimensions } from "react-native";
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
                    ctx_shift: false
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
            setResult('Analyzing image...');

            const { filePath } = await photoOutputRef.current.capturePhotoToFile({
                enableShutterSound: false
            }, {});
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
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Analyze the image and list objects you see. Reply with just their names, one per line.' },
                            { type: 'image_url', image_url: { url: `file://${cleanDest}` } }
                        ]
                    }
                ],
                temperature: 0.0,
                top_p: 0.9,                  // Discards low-probability stray tokens
                top_k: 1,
                penalty_repeat: 1.2,         // penalize the model if it repeats words/lines
                penalty_present: 0.1,        // Encourages introducing fresh words/lines
                n_predict: 64,               // list a few words
                stop: [
                    '</s>',
                    '<|im_end|>',            // Common chat/instruct terminator sequence
                    '<|endoftext|>',
                    '\n\n\n'                 // If the model hits enter 3 times, cut it off (avoid repeating)
                ],
            });

            await context.clearCache();

            setResult(`Recognition Result:\n${response.text.trim()}` || 'No recognizable objects found.');
        } catch (error: any) {
            setResult(`Analysis failed: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (!hasPermission) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 20 }}>
                    Camera permission required.
                </Text>
                <TouchableOpacity onPress={requestPermission} style={styles.button}>
                    <Text style={styles.btnText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!device) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={{ color: '#fff' }}>Camera hardware not found.</Text>
            </View>
        );
    }

    const showExpandedResult = !isAnalyzing && photoUri;

    return (
        <View style={styles.container}>
            <View style={styles.imageCameraWrapper}>
                {photoUri ? (
                    <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                ) : previewOutputRef.current ? (
                    <NativePreviewView
                        previewOutput={previewOutputRef.current}
                        style={StyleSheet.absoluteFillObject}
                    />
                ) : (
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000' }]} />
                )}
            </View>

            <TouchableOpacity
                style={[
                    styles.takephotoButton,
                    { bottom: showExpandedResult ? '38%' : 130 } // Safely stands clear of both states
                ]}
                disabled={isAnalyzing}
                onPress={async () => {
                    if (isAnalyzing) return;

                    if (photoUri) {
                        try {
                            setResult("");
                            await FileSystem.deleteAsync(photoUri, { idempotent: true });
                            setPhotoUri(null);
                            await sessionRef.current?.start();
                            setSessionReady(true);
                        } catch (error: any) {
                            setResult(`Retake failed: ${error.message}`);
                        }
                    } else {
                        captureAndRecognize();
                    }
                }}
            >
                <Text style={styles.btnText}>
                    {isAnalyzing ? "Analyzing..." : photoUri ? 'Retake Photo' : 'Capture Image'}
                </Text>
            </TouchableOpacity>

            <View style={[styles.uiBox, showExpandedResult ? styles.uiBoxExpanded : styles.uiBoxCollapsed]}>
                <Text style={styles.statusText}>{result}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000'
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    imageCameraWrapper: {
        ...StyleSheet.absoluteFillObject,
    },
    uiBox: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#353535',
        alignItems: 'center',
        justifyContent: 'center',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    uiBoxCollapsed: {
        height: 100,
    },
    uiBoxExpanded: {
        height: '35%',
        paddingVertical: 20,
    },
    statusText: {
        fontSize: 16,
        textAlign: 'center',
        color: '#fff',
        fontWeight: '500'
    },
    button: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 30,
        paddingVertical: 15,
        borderRadius: 25
    },
    btnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    },
    takephotoButton: {
        elevation: 10,
        position: 'absolute',
        alignSelf: 'center',
        backgroundColor: '#007AFF',
        paddingHorizontal: 30,
        paddingVertical: 15,
        borderRadius: 25,
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        zIndex: 10,
    },
});