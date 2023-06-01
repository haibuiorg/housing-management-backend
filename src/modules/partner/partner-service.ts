import { Request, Response } from "express";


export const getPartnerReequest = async (request: Request, response: Response) => {
  try {

  } catch (err) {
    console.log(err);
    response.status(500).send(err);
  }

}