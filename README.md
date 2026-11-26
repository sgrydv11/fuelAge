# FuelTrack

Run `python serve.py` and open [FuelTrack locally](http://127.0.0.1:8000). Vehicle settings, fuel logs and compressed photos stay in the browser. On mobile, the camera button opens the device's image capture when supported. The first browser OCR scan downloads Tesseract's worker and language data.

## Odometer and receipt photos

Choose **Odometer** or **Fuel receipt**, then select **Read photo**. Use a close-up of a digital display or mechanical number wheels, or drag around the digits before scanning. Check each autofilled value. Receipt OCR looks for a fuel quantity in the vehicle's selected unit and an odometer value when explicitly labeled.

For automatic region detection, use an odometer detection checkpoint trained with the [upstream YOLOv8 notebook](https://github.com/umutkavakli/odometer-mileage-extraction/blob/main/yolo_train.ipynb). The upstream project does not list a ready-to-download trained checkpoint. Use a Python environment compatible with PyTorch, then run:

```powershell
python -m pip install -r requirements-ocr.txt
python serve.py --weights C:\path\to\best.pt
```

This uses the upstream project’s approach of cropping a detected odometer region before passing it to digit-only EasyOCR. Train on both digital and mechanical odometer examples. If the model also detects unrelated objects, give the exact odometer class as `--label` (repeatable). This optional Python model path runs locally. The standalone hosted UI uses browser OCR for both odometer photos and receipts.

## Calculation

Mileage uses distance divided by the fuel added after one full fill-up through the next full fill-up, including intervening partial fills. Average mileage weights those intervals by fuel quantity. Running cost uses intervals where all costs were entered. Gallons are US gallons. Enter costs in a consistent currency per vehicle.

## Android app

FuelAge bundles the tracker, camera/file picker, and the Google ML Kit Latin text model. Vehicle history and photos stay on the device. For the best reading, take a straight close-up and select only the odometer digits, leaving a small margin. FuelAge uses a dedicated seven-segment decoder for cropped digital displays and ML Kit for general OCR, including mechanical digits. If the readers disagree, the app leaves the reading for you to confirm or enter. It can also read fuel receipt text. The Python YOLOv8/EasyOCR integration above is available separately for the web app.

To install, open the locally built FuelAge APK on an Android 7.0 or newer device with an updated Android System WebView. Android may ask you to allow installation from the app opening the APK. The local APK is signed with the Android debug key.

To rebuild, install Android SDK Platform 35, Build Tools 35.0.0, and a compatible JDK (17 or 21). From the android directory, run:

```powershell
.\gradlew.bat :app:assembleDebug
```

The APK is generated at android/app/build/outputs/apk/debug/app-debug.apk.
