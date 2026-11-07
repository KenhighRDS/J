import { Config } from "@remotion/cli/config";
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setCrf(17);
Config.setPixelFormat("yuv420p");
Config.setOverwriteOutput(true);
