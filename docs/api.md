## Cadre peer authorization:

Sent from authority to drone provider to spawn new cadre member. Network ID is assumed for all control strands

```ts
createCadrePeer(): Promise<PeerId>;
registerCadrePeer(peerId: PeerId, bootstrapNodes: Multiaddr[], authorityKey: string, signature: string);
```

Between creating the peer and registering it, the caller adds the peer to the control network, so that at registration, the peer is already a member of the control network and is able to join.

## Member registration:

Send from invited member to any cadre member to accept invitation and include as a member.

```ts
type Registration = {
    strandId: string, 
    key: string, 
    peer_ids: PeerId[],
};
registerMember(registration: Registration, signature: string): Promise<{success: boolean; reason?: string}>;
```

## Strand Solicitation:

### Open invite

Send from a party who accessed an open invitation to form a strand with me, to any of my cadre members.

Open invitation:
```ts
type OpenInvitation = {
    token: string;
    appId: string;
    expiration: DateTime,
    bootstrap: Muliaddr[],
}
```

Invitee forms:
```ts
formStrand(token: string, disclosure: object): { memberKey: string, invitePrivateKey: string };
```

## Validate Strand Formation

```ts
validateStrandFormation(token string, disclosure: object): { validationKey: string; validationSignature: string };
```
