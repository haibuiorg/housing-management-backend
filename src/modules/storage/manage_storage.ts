import { GetSignedUrlConfig } from '@google-cloud/storage';
import admin from 'firebase-admin';
export const getPublicLinkForFile = async (fileName: string, expires?: number) => {
  const options: GetSignedUrlConfig = {
    version: 'v4',
    action: 'read',
    expires: expires ?? Date.now() + 900000,
  };

  // Get a v4 signed URL for reading the file
  const [url] = await admin.storage().bucket().file(fileName).getSignedUrl(options);
  return url;
};

export const copyStorageFolder = async (fromFolder: string, toFolder: string) => {
  const bucket = admin.storage().bucket();

  const [files] = await bucket.getFiles({ prefix: fromFolder });
  const promiseArray = files.map((file) => {
    const destination = file.name.replace(fromFolder, toFolder);
    return file.copy(destination);
  });
  return Promise.all(promiseArray);
};

export const copyStorageFile = async (fromFolder: string, toFolder: string) => {
  const bucket = admin.storage().bucket();

  const [files] = await bucket.getFiles({ prefix: fromFolder });
  const promiseArray = files.map((file) => {
    const destination = file.name.replace(fromFolder, toFolder);
    return file.copy(destination);
  });
  return Promise.all(promiseArray);
};
