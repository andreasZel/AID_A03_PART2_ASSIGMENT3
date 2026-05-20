import { useEffect, useRef, useState } from "react";
import { TouchableOpacity, View, StyleSheet, Text, Image } from "react-native";
import { Camera, useCameraDevice } from "react-native-vision-camera";
import { initLlama, LlamaContext } from "llama.rn";
import { File, Paths } from 'expo-file-system';

export function StaticObjectScanner() {
    const cameraRef = useRef<typeof Camera>(null);
    const device = useCameraDevice('back');

    const [context, setContext] = useState<LlamaContext | null>(null);
    const [result, setResult] = useState('Loading local AI model...');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    useEffect(() => {
        const loadLocalModel = async () => {
            try {
                const modelFile = new File(Paths.document, '../assets/models/SmolVLM2-256M-Video-Instruct-Q8_0.gguf');
                const mmprojFile = new File(Paths.document, '../assets/models/mmproj-SmolVLM2-256M-Video-Instruct-Q8_0.gguf');

                if (!modelFile.exists || !mmprojFile.exists) {
                    setResult('Model files not found. Please download them first.');
                    return;
                }

                // init the model
                const llamaContext = await initLlama({
                    model: modelFile.uri,
                    n_ctx: 2048,
                    ctx_shift: false
                });

                // attach the mmproj
                const multimodalReady = await llamaContext.initMultimodal({
                    path: mmprojFile.uri,
                    use_gpu: true,
                });

                if (!multimodalReady) {
                    setResult('Failed to initialize vision support.');
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

    // 2. Capture a single static image and process it
    const captureAndRecognize = async () => {
        if ((!cameraRef.current) || !context) return;

        try {
            setIsAnalyzing(true);
            setResult('Analyzing image completely offline...');

            // @ts-ignore
            const photo = await cameraRef.current.takePhoto({
                flash: 'off',
                enableShutterSound: false
            });

            const localImageFile = `file://${photo.path}`;
            setPhotoUri(localImageFile);

            const prompt = 'Describe the main objects you see in this image.';

            const tokenizeResult = await context.tokenize(
                `Describe this image: <__media__>`,
                { media_paths: [localImageFile] }
            );

            const response = await context.completion({
                prompt: prompt,
                guide_tokens: tokenizeResult.tokens,
            });

            setResult(response.text); // Displays the identified objects
        } catch (error: any) {
            setResult(`Analysis failed: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (device == null) return <Text>Camera hardware not found.</Text>;

    return (
        <View style={styles.container}>
            {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.viewer} />
            ) : (
                <Camera ref={cameraRef as any} style={styles.viewer} device={device} isActive={true} />
            )}

            <View style={styles.uiBox}>
                <Text style={styles.statusText}>{result}</Text>

                {photoUri ? (
                    <TouchableOpacity style={styles.button} onPress={() => setPhotoUri(null)}>
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