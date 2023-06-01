import { PineconeClient } from '@pinecone-database/pinecone';
import admin from 'firebase-admin';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { VectorDBQAChain } from 'langchain/chains';
import { Document } from 'langchain/document';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { OpenAI } from 'langchain/llms/openai';
import { BufferMemory, ChatMessageHistory } from 'langchain/memory';
import { AIChatMessage, HumanChatMessage } from 'langchain/schema';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ChainTool } from 'langchain/tools';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { ChatCompletionRequestMessage, Configuration, CreateImageRequestSizeEnum, OpenAIApi } from "openai";
import os from 'os';
import { AI_SENDER_ID } from '../../constants';
import { Message } from '../../dto/message';

export const askQuestion = async (
  question: string,
  indexName: string,
  docType: string,
  chat_history: string[],
): Promise<string> => {
  const answer = await queryPineconeVectorStoreAndQueryLLM(indexName, question, docType, chat_history);
  return answer ?? 'Sorry can you be more specific?';
};

export const addReferenceDoc = async (
  storageLink: string,
  docName: string,
  docType: string,
  languageCode: string,
  indexName: string,
) => {
  const tmpFile = os.tmpdir() + '/' + docName;
  await admin.storage().bucket().file(storageLink).download({ destination: tmpFile });
  /*const loader = new DirectoryLoader(tmpFile, {
        ".txt": (path) => new TextLoader(path),
        ".pdf": (path) => new PDFLoader(path),
    });*/
  const loader = new PDFLoader(tmpFile);
  const rawDocs = await loader.load();

  await updatePinecone(indexName, rawDocs, docType, languageCode);
};

// 2. Export updatePinecone function
export const updatePinecone = async (indexName: string, rawDocs: Document[], docType: string, languageCode: string) => {
  /* Split text into chunks */
  const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY ?? '',
    environment: process.env.PINECONE_ENVIRONMENT ?? '',
  });
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const docs = await textSplitter.splitDocuments(rawDocs);
  console.log('split docs', docs);

  console.log('creating vector store...');
  /*create and store the embeddings in the vectorStore*/
  const embeddings = new OpenAIEmbeddings();
  const index = pinecone.Index(indexName); //change to your own index name

  //embed the PDF documents
  await PineconeStore.fromDocuments(docs, embeddings, {
    pineconeIndex: index,
    namespace: docType,
    textKey: 'text',
    filter: {
      languageCode,
    },
  });
  console.log('finished creating vector store');
};

export const getPineconeIndexes = async (): Promise<string[]> => {
  try {
    const pinecone = new PineconeClient();
    await pinecone.init({
      apiKey: process.env.PINECONE_API_KEY ?? '',
      environment: process.env.PINECONE_ENVIRONMENT ?? '',
    });
    const existingIndexes = await pinecone.listIndexes();
    return existingIndexes;
  } catch (err) {
    console.log(err);
  }
  return [];
};

export const createPineconeIndex = async (indexName: string, vectorDimension = 1536) => {
  const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY ?? '',
    environment: process.env.PINECONE_ENVIRONMENT ?? '',
  });
  const existingIndexes = await pinecone.listIndexes();
  if (!existingIndexes.includes(indexName)) {
    console.log(`Creating "${indexName}"...`);
    // 5. Create index
    const createClient = await pinecone.createIndex({
      createRequest: {
        name: indexName,
        dimension: vectorDimension,
        metric: 'cosine',
      },
    });
    // 6. Log successful creation
    console.log(`Created with client:`, createClient);
  } else {
    // 8. Log if index already exists
    console.log(`"${indexName}" already exists.`);
  }
};

const queryPineconeVectorStoreAndQueryLLM = async (
  indexName: string,
  question: string,
  docType: string,
  chat_history: string[],
): Promise<string | undefined> => {
  const sanitizedQuestion = question.trim().replaceAll('\n', ' ');

  try {
    const client = new PineconeClient();
    await client.init({
      apiKey: process.env.PINECONE_API_KEY ?? '',
      environment: process.env.PINECONE_ENVIRONMENT ?? '',
    });
    const index = client.Index(indexName);

    /* create vectorstore*/
    const vectorStore = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings({}), {
      pineconeIndex: index,
      textKey: 'text',
      namespace: docType, //namespace comes from your config folder
    });

    //create chain
    const executor = await makeExecutor(vectorStore, chat_history);

    const response = await executor?.call({ input: sanitizedQuestion, question: sanitizedQuestion, chat_history: [] });

    //Ask a question using chat history
    /*const response = await chain.call({
      question: sanitizedQuestion,
      chat_history,
    });*/

    return response?.output;
  } catch (error) {
    console.log('error', error);
    return;
  }
};



const makeExecutor = async (vectorStore: PineconeStore, chat_history: string[]) => {
  process.env.LANGCHAIN_HANDLER = "langchain";
  const model = new OpenAI({
    temperature: 0.01, // increase temepreature to get more creative answers
    modelName: 'gpt-3.5-turbo-0301', //change this to gpt-4 if you have access
  });
  const pastMessages = [];
  for (let i = 0; i < chat_history.length - 1; i++) {
    if (chat_history[i].startsWith('Input: ')) {
      pastMessages.push(new HumanChatMessage(chat_history[i].replace('Input: ', '')));
      pastMessages.push(new AIChatMessage(chat_history[i + 1].replace('Output: ', '')));
    }
  }
  const memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    memoryKey: 'chat_history',
    inputKey: 'input',
    outputKey: 'output',
  });

  const chain = VectorDBQAChain.fromLLM(model, vectorStore);
  chain.memory = memory;

  const qaTool = new ChainTool({
    name: 'housing-association-qa',
    description:
      'Housing association and housing company information - useful for when you need to ask questions about housing association.',
    chain: chain,
    verbose: true,
  },);
  const tools = [
    /*new SerpAPI(process.env.SERP_API_KEY, {
      location: 'Austin,Texas,United States',
      hl: 'en',
      gl: 'us',
    }),*/
    qaTool,
  ];
  try {
    const executor = await initializeAgentExecutorWithOptions(tools, model, {
      agentType: 'chat-conversational-react-description',
      memory,
      verbose: true,
    });
    console.log('executor', executor);
    return executor;
  } catch (e) {
    console.log(e);
  }

  return;
};

export const adminAskQuestion = async (userId: string, question: string, chatHistory: Message[]) => {

  try {

    const messages: ChatCompletionRequestMessage[] = chatHistory.map(
      (item) => {
        return {
          role: item.sender_id == userId ? 'user' : item.sender_id == AI_SENDER_ID ? 'assistant' : 'system',
          content: item.message,
          //name: adminUser.first_name + adminUser.first_name
        }
      }
    );
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages,
      user: userId
    });
    console.log('completion', completion);
    const answer = completion.data.choices[0].message?.content ?? 'Sorry, I did not understand that. Can you please rephrase your question?';
    return answer;

  } catch (error) {
    console.log('error', error);
  }
  return 'Sorry, I did not understand that. Can you please rephrase your question?';
}

export const generateImage = async (userId: string, prompt: string, numberOfImages = 1, size: CreateImageRequestSizeEnum) => {
  try {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);
    const response = await openai.createImage({
      prompt,
      n: numberOfImages,
      size,
      user: userId
    });
    return response.data;
  } catch (error) {
    console.log('error', error);

  }

}
/*const CONDENSE_PROMPT = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {input}
Standalone question:`;

const QA_PROMPT = `You are a helpful AI assistant working for Priorli, a SaaS company providing solutions for housing and apartment manangement. Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.

{context}

Question: {text}
Helpful answer in markdown:`;*/