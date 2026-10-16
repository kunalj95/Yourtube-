
"use strict";

import multer from "multer";

const storage = multer.memoryStorage();

const filefilter = (req, file, cb) => {
  if (file.mimetype === "video/mp4") {
    cb(null, true);
  } else {
    cb(new Error("Only MP4 video files are allowed"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: filefilter,
});

export default upload;
