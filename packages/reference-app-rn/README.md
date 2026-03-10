

```
cd .\packages\reference-app-rn\
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
~/AppData/Local/Android/Sdk/platform-tools/adb reverse tcp:8081 tcp:8081
yarn android
yarn start --host localhost
```