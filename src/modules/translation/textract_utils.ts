import { has, values, includes, PropertyPath } from "lodash";
import { FirebaseObject } from "../../dto/firebase_object";
import { Block } from "@aws-sdk/client-textract/dist-types/models/models_0";

const getText = (result: FirebaseObject, blocksMap: FirebaseObject) => {
  let text = "";

  if (has(result, "Relationships")) {
    result.Relationships.forEach((relationship: FirebaseObject) => {
      if (relationship.Type === "CHILD") {
        relationship.Ids.forEach((childId: string | number) => {
          const word = blocksMap[childId];
          if (word.BlockType === "WORD") {
            text += `${word.Text} `;
          }
          if (word.BlockType === "SELECTION_ELEMENT") {
            if (word.SelectionStatus === "SELECTED") {
              text += `X `;
            }
          }
        });
      }
    });
  }

  return text.trim();
};

const findValueBlock = (keyBlock: FirebaseObject, valueMap: FirebaseObject) => {
  let valueBlock: FirebaseObject = {};
  keyBlock.Relationships.forEach((relationship: { Type: string; Ids: any[]; }) => {
    if (relationship.Type === "VALUE") {
      relationship.Ids.every((valueId: PropertyPath) => {
        if (has(valueMap, valueId) && valueId) {
          valueBlock = valueMap[valueId.toString()];
          return false;
        }
      });
    }
  });

  return valueBlock;
};

export const getKeyValueRelationship = (keyMap: FirebaseObject, valueMap: FirebaseObject, blockMap: FirebaseObject) => {
  const keyValues: FirebaseObject = {};

  const keyMapValues = values(keyMap);

  keyMapValues.forEach((keyMapValue) => {
    const valueBlock = findValueBlock(keyMapValue, valueMap);
    const key = getText(keyMapValue, blockMap);
    const value = getText(valueBlock, blockMap);
    keyValues[key] = value;
  });

  return keyValues;
};

export const getKeyValueMap = (blocks: Block[]) => {
  const keyMap: FirebaseObject = {};
  const valueMap: FirebaseObject = {};
  const blockMap: FirebaseObject = {};

  let blockId;
  blocks.forEach((block) => {
    blockId = block.Id ?? 'id';
    blockMap[blockId] = block;

    if (block.BlockType === "KEY_VALUE_SET") {
      if (includes(block.EntityTypes, "KEY")) {
        keyMap[blockId] = block;
      } else {
        valueMap[blockId] = block;
      }
    }
  });

  return { keyMap, valueMap, blockMap };
};
