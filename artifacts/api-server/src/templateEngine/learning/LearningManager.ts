import Anthropic from "@anthropic-ai/sdk";

import { LearningResult } from "./LearningResult";

export class LearningManager {

    constructor(

        private readonly anthropic: Anthropic

    ) {}

    async learnUnknownTemplate(

        pdfBuffer: Buffer,

        fingerprint: string

    ): Promise<LearningResult> {

        //
        // STEP 1
        //
        // Move the EXISTING Claude learning code
        // from uploads.ts into this function.
        //
        // DO NOT change any logic.
        //
        // Simply return LearningResult.
        //

        throw new Error(
            "Not implemented"
        );

    }

}