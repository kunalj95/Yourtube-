
import video from "../Modals/video.js";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadvideo = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "Please upload an MP4 video file only",
    });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "video",
          folder: "yourtube",
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      Readable.from(req.file.buffer).pipe(uploadStream);
    });

    const file = new video({
      videotitle: req.body.videotitle,
      filename: req.file.originalname,
      filepath: result.secure_url,
      filetype: req.file.mimetype,
      filesize: String(req.file.size),
      videochanel: req.body.videochanel,
      uploader: req.body.uploader,
    });

    await file.save();

    return res.status(201).json({
      message: "Video uploaded successfully",
      video: file,
    });
  } catch (error) {
    console.error("Video upload error:", error);

    return res.status(500).json({
      message: "Video upload failed",
    });
  }
};

export const getallvideo = async (req, res) => {
  try {
    const files = await video.find();

    return res.status(200).send(files);
  } catch (error) {
    console.error("Error fetching videos:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};
