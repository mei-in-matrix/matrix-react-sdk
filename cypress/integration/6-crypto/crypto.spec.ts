/*
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/// <reference types="cypress" />

import type { MatrixClient } from "matrix-js-sdk/src/matrix";
import { SynapseInstance } from "../../plugins/synapsedocker";

function waitForEvent(cli: MatrixClient, event: any, check: () => boolean, callback: () => void) {
    if (check()) {
        callback();
    } else {
        cli.once(event, () => waitForEvent(cli, event, check, callback));
    }
}

describe("Cryptography", () => {
    beforeEach(() => {
        cy.startSynapse("default").as('synapse').then(
            synapse => cy.initTestUser(synapse, "Alice"),
        );
    });

    afterEach(() => {
        cy.get<SynapseInstance>('@synapse').then(synapse => cy.stopSynapse(synapse));
    });

    it("should receive and decrypt encrypted messages", () => {
        cy.get<SynapseInstance>('@synapse').then(synapse => cy.getBot(synapse, "Beatrice").as('bot'));

        cy.createRoom({
            initial_state: [
                {
                    type: "m.room.encryption",
                    state_key: '',
                    content: {
                        algorithm: "m.megolm.v1.aes-sha2",
                    },
                },
            ],
        }).as('roomId');

        cy.get<MatrixClient>('@bot').then(bot =>
            cy.get<string>('@roomId').then(roomId =>
                cy.inviteUser(roomId, bot.getUserId())
                    .then(() => cy.visit("/#/room/" + roomId))
                    .then(() => cy.window().then(win => cy.wrap(
                        new Promise<void>(resolve =>
                            waitForEvent(
                                bot,
                                win.matrixcs.RoomStateEvent.Update,
                                // @ts-ignore - protected
                                () => bot.roomList.isRoomEncrypted(roomId),
                                resolve,
                            ),
                        ).then(() => bot.sendMessage(roomId, {
                            body: "Top secret message",
                            msgtype: "m.text",
                        })),
                    ))),
            ),
        );

        cy.get(".mx_RoomView_body .mx_cryptoEvent").should("contain", "Encryption enabled");

        cy.get(".mx_EventTile_body")
            .contains("Top secret message")
            .parent().parent()
            .should("not.have.descendants", ".mx_EventTile_e2eIcon_warning");
    });
});
