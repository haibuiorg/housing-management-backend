import { AnalyzeDocumentCommand, AnalyzeDocumentRequest, TextractClient } from '@aws-sdk/client-textract';
import admin from 'firebase-admin';
import { Configuration, CreateCompletionResponse, OpenAIApi } from 'openai';
import { DOCUMENTS, TRANSLATIONS } from '../../constants';

import { StorageItem } from '../../dto/storage_item';
import { Translation } from '../../dto/translation';
import { getKeyValueMap, getKeyValueRelationship } from './textract_utils';

export const getMessageTranslation = async (
  message: string,
  channelId: string,
  type: 'announcement' | 'message' | 'support',
  requestedBy: string,
): Promise<Translation[]> => {
  if (message.length === 0) {
    return [];
  }
  //TODO translate with multiple languages
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);
  // this should be company support language
  const languageCode = 'fi';
  const languageName = getLanguageName(languageCode);
  //message = message.replaceAll('\n', '/\n');
  const prompt = `Given this text: "${message}".If it is emoji, dont translate. If text is in English translate it to ${languageName}. Else if text is another language, translate text to English and ${languageName}. Response in JSON format with list, include orginal text: {"translated_message": [{"language_code": ISO 639-1 code of translated to language or original, "value": translated value}]}`;
  try {
    const response = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt,
      temperature: 0.4,
      max_tokens: 2000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });
    updateMessageTranslationData(response.data, type, channelId, requestedBy);
    const responseText = response.data.choices[0].text?.trim().replaceAll('\n', '').replaceAll('\r', '');
    console.log(responseText);
    //TODO maybe store response in our database
    const translated = JSON.parse(responseText ?? '');
    return translated.translated_message;
  } catch (error) {
    console.log(error);
  }
  return [];
};

const updateMessageTranslationData = async (
  response: CreateCompletionResponse,
  type: 'announcement' | 'message' | 'support',
  channel_id: string,
  requestedBy: string,
) => {
  try {
    await admin.firestore().collection(TRANSLATIONS).add({
      requested_by: requestedBy,
      type,
      channel_id,
      data: response,
    });
  } catch (error) {
    console.log(error);
  }
};

const getLanguageName = (languageCode?: string): string => {
  // add more languages if needed
  return languageCode?.toLocaleLowerCase() === 'fi' ? 'Finnish' : 'English';
};

export const storageItemTranslation = async (storageItems: StorageItem[]) => {
  await Promise.all(
    storageItems.map(async (item: StorageItem) => {
      if (!item.storage_link || !item.id) {
        return;
      }

      try {
        const [buffer] = await admin.storage().bucket().file(item.storage_link).download();

        const filePath = item.storage_link + '_textract.json';

        const textract = new TextractClient({ region: 'eu-central-1' });
        const detectParams: AnalyzeDocumentRequest = {
          Document: {
            Bytes: buffer,
          },
          FeatureTypes: ['TABLES', 'FORMS'],
        };
        const gs = admin
          .storage()
          .bucket()
          .file(filePath)
          .createWriteStream({
            resumable: false,
            validation: false,
            contentType: 'auto',
            metadata: {
              'Cache-Control': 'public, max-age=31536000',
            },
          })
          .addListener('finish', async () => {
            console.log(filePath);
          })
          .addListener('error', (e) => {
            console.error(e);
          });
        const result = await textract.send(new AnalyzeDocumentCommand(detectParams));
        if (result && result.Blocks) {
          const { keyMap, valueMap, blockMap } = getKeyValueMap(result.Blocks);
          const keyValues = getKeyValueRelationship(keyMap, valueMap, blockMap);
          const dataJson = JSON.stringify(keyValues);
          console.log(dataJson);
          gs.write(dataJson);
          gs.end();
          const configuration = new Configuration({
            apiKey: process.env.OPENAI_API_KEY,
          });
          const openai = new OpenAIApi(configuration);
          const languageCode = 'fi';
          const languageName = getLanguageName(languageCode);
          const prompt = `Given this json object: "${dataJson}". If it is in English make a short summary in ${languageName}. Else if text is another language, make a short summary in English and ${languageName}. Response in JSON format with list, include orginal text: {"translated_message": [{"language_code": ISO 639-1 code of translated to language or original, "value": translated value}]}`;
          console.log(prompt);
          const response = await openai.createCompletion({
            model: 'text-davinci-003',
            prompt,
            temperature: 0.25,
            max_tokens: 500,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
          });
          const responseText = response.data.choices[0].text?.replaceAll('\n', '');
          console.log(responseText);
          const translated = JSON.parse(responseText ?? '').translated_message;
          updateStorageItemTranslationData(translated, item.id ?? '');
        }

        // process data.
      } catch (error) {
        console.log(error);
        // error handling.
      } finally {
        // finally.
      }
    }),
  );
};

const updateStorageItemTranslationData = (translated: Translation[], storageItemId: string) => {
  admin
    .firestore()
    .collectionGroup(DOCUMENTS)
    .where('id', '==', storageItemId)
    .get()
    .then((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        doc.ref.update({ summary_translation: translated });
      });
    });
};
