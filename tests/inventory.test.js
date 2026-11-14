import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readState, STORAGE_KEY, counts, identity, limitDeck, grant} from '../shared/inventory.js';
const cards=[{path:'main/a',url:'a'},{path:'main/b',url:'b'}];
test('inventory keeps duplicate grants and uses normalized stable card paths',()=>{
 assert.deepEqual(grant({},[cards[0],cards[0],cards[1]]),{'main/a':2,'main/b':1});
 assert.equal(identity({path:'main\\a'}),'main/a');
});
test('saved and imported decks obey ownership, copy limits and deck capacity',()=>{
 assert.deepEqual(limitDeck(cards,{'main/a':999,'main/b':999},{'main/a':1},40,()=>3),{a:1});
 assert.deepEqual(limitDeck(cards,{'main/a':999,'main/b':999},null,4,()=>3),{a:3,b:1});
 assert.deepEqual(limitDeck(cards,{'main/a':-1,'main/b':Infinity},null,40,()=>3),{});
});
test('storage tolerates blocked, malformed and unsupported data without deleting it',()=>{
 for(const raw of ['{','null','{"version":2}', '{"version":1,"mode":"pack","inventory":{},"decks":null}']) {
  let reads=0;assert.equal(readState({getItem(key){assert.equal(key,STORAGE_KEY);reads++;return raw;}}).failed,true);assert.equal(reads,1);
 }
 assert.equal(readState({getItem(){throw Error('blocked');}}).failed,true);
 assert.deepEqual(counts({a:2,b:-1,c:'3',d:NaN,e:1.5}),{a:2});
});

test('all three modes retain isolated decks while older two-mode saves remain readable',()=>{
 const state={version:1,mode:'anarchy',inventory:{'main/a':2},decks:{normal:{main:{'main/a':1}},anarchy:{main:{'main/a':4}},pack:{main:{'main/b':2}}}};
 const loaded=readState({getItem(){return JSON.stringify(state);}}).state;
 assert.equal(loaded.decks.normal.main['main/a'],1);
 assert.equal(loaded.decks.anarchy.main['main/a'],4);
 assert.equal(loaded.decks.pack.main['main/b'],2);
 state.mode='pack';delete state.decks.anarchy;delete state.decks.pack;
 assert.deepEqual(readState({getItem(){return JSON.stringify(state);}}).state.inventory,{'main/a':2});
});

test('retired mode state falls back safely without losing active decks or inventory',()=>{
 const state={version:1,mode:'retired',inventory:{'main/a':2},decks:{normal:{main:{'main/a':1}},pack:{main:{'main/a':2}},retired:{main:{'main/b':3}}}};
 const loaded=readState({getItem(){return JSON.stringify(state);}}).state;
 assert.equal(loaded.mode,'normal');assert.deepEqual(loaded.inventory,{'main/a':2});assert.equal(loaded.decks.pack.main['main/a'],2);assert.equal('retired' in loaded.decks,false);
});


test('Limited common corpses need no owned copies and survive deck restoration', async () => {
 const {availableCopies} = await import('../shared/inventory.js');
 const common = {path:'corpse/common',url:'common',resourceType:'common'};
 const peculiar = {path:'corpse/peculiar',url:'peculiar',resourceType:'peculiar'};
 assert.equal(availableCopies(common, {}), Infinity);
 assert.equal(availableCopies(peculiar, {}), 0);
 assert.deepEqual(limitDeck([common, peculiar], {'corpse/common':20,'corpse/peculiar':3}, {}, 20, () => 20), {common:20});
 assert.deepEqual(limitDeck([common], {'corpse/common':99}, {}, 20, () => 20), {common:20});
});
