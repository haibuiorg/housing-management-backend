import { PineconeClient } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { OpenAI } from 'langchain/llms/openai';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { Document } from 'langchain/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import admin from 'firebase-admin';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { SerpAPI, ChainTool } from 'langchain/tools';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import os from 'os';

export const askQuestion = async (
  question: string,
  indexName: string,
  docType: string,
  chat_history: string[],
): Promise<string> => {
  const answer = await queryPineconeVectorStoreAndQueryLLM(indexName, question, docType, chat_history);
  return answer ?? '';
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
  /*const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY ?? '',
    environment: process.env.PINECONE_ENVIRONMENT ?? '',
  });
  console.log('Retrieving Pinecone index...');
  const index = pinecone.Index(indexName);
  console.log(`Pinecone index retrieved: ${indexName}`);
  for (const doc of docs) {
    console.log(`Processing document: ${doc.metadata.source}`);
    const txtPath = doc.metadata.source;
    const text = doc.pageContent;
    // 6. Create RecursiveCharacterTextSplitter instance
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
    console.log('Splitting text into chunks...');
    // 7. Split text into chunks (documents)
    const chunks = await textSplitter.createDocuments([text]);
    console.log(`Text split into ${chunks.length} chunks`);
    console.log(`Calling OpenAI's Embedding endpoint documents with ${chunks.length} text chunks ...`);
    // 8. Create OpenAI embeddings for documents
    const embeddingsArrays = await new OpenAIEmbeddings().embedDocuments(
      chunks.map((chunk) => chunk.pageContent.replace(/\n/g, ' ')),
    );
    console.log('Finished embedding documents');
    console.log(`Creating ${chunks.length} vectors array with id, values, and metadata...`);
    // 9. Create and upsert vectors in batches of 100
    const batchSize = 100;
    let batch = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const vector = {
        id: `${txtPath}_${idx}`,
        values: embeddingsArrays[idx],
        metadata: {
          ...chunk.metadata,
          loc: JSON.stringify(chunk.metadata.loc),
          pageContent: chunk.pageContent,
          txtPath,
          docType,
          languageCode,
        },
      };
      batch.push(vector);
      // When batch is full or it's the last item, upsert the vectors
      if (batch.length === batchSize || idx === chunks.length - 1) {
        await index.upsert({
          upsertRequest: {
            vectors: batch,
          },
        });
        // Empty the batch
        batch = [];
      }
    }
    // 10. Log the number of vectors updated
    console.log(`Pinecone index updated with ${chunks.length} vectors`);
  }*/
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
  /*console.log('Querying Pinecone vector store...');
  const pineconeIndex = client.Index(indexName);
  console.log(`Asking question: ${question}...`);
  const llm = new OpenAI({ openAIApiKey: process.env.OPENAI_API_KEY ?? '', temperature: 0 });
  const queryEmbedding = await new OpenAIEmbeddings().embedQuery(question);
  const queryResponse = await pineconeIndex.query({
    queryRequest: {
      topK: 10,
      vector: queryEmbedding,
      includeMetadata: true,
      includeValues: true,
    },
  });
  if (!queryResponse.matches) {
    return;
  }
  const concatenatedPageContent = queryResponse.matches
    .map((match) => (match?.metadata as FirebaseObject).pageContent)
    .join(' ');
  const documents = [new Document({ pageContent: concatenatedPageContent })];
  const chain = loadQAStuffChain(llm);
  // 11. Execute the chain with input documents and question
  const result = await chain.call({
    question: question,
    input_documents: documents,
    chat_history: chat_history,
  });
  // 12. Log the answer
  console.log({ result });
  return result.text.toString().replaceAll('\n', '').trim();*/
  // OpenAI recommends replacing newlines with spaces for best results
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
    const executor = await makeExecutor(vectorStore);
    console.log('executor', 'executor created');
    const response = await executor?.call({ input: sanitizedQuestion });

    //Ask a question using chat history
    /*const response = await chain.call({
      question: sanitizedQuestion,
      chat_history,
    });*/
    console.log('response', response?.output.toString());

    return response?.output;
  } catch (error) {
    console.log('error', error);
    return;
  }
};

const CONDENSE_PROMPT = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone question:`;

const QA_PROMPT = `You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.

{context}

Question: {question}
Helpful answer in markdown:`;

const makeExecutor = async (vectorstore: PineconeStore) => {
  const model = new OpenAI({
    temperature: 0.3, // increase temepreature to get more creative answers
    modelName: 'gpt-3.5-turbo', //change this to gpt-4 if you have access
  });
  const chain = ConversationalRetrievalQAChain.fromLLM(model, vectorstore.asRetriever(), {
    qaTemplate: QA_PROMPT,

    questionGeneratorTemplate: CONDENSE_PROMPT,
    returnSourceDocuments: true, //The number of source documents returned is 4 by default
  });
  const qaTool = new ChainTool({
    name: 'housing-association-qa',
    description:
      'Housing association or housing company QA - useful for when you need to ask questions about housing association.',
    chain: chain,
    returnDirect: true,
  });
  const tools = [
    new SerpAPI(process.env.SERP_API_KEY, {
      location: 'Austin,Texas,United States',
      hl: 'en',
      gl: 'us',
    }),
    qaTool,
  ];
  try {
    const executor = await initializeAgentExecutorWithOptions(tools, model, {
      agentType: 'chat-conversational-react-description',
    });
    return executor;
  } catch (e) {}

  return;
};
