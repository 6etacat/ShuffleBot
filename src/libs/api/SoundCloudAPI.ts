"use strict"

import * as _ from 'lodash';

import { requestPromise } from '../common/Utils';
import { Track, SCUser } from '../../typings';
import { EventEmitter }  from 'events';

export class SoundCloudAPI {

  private SC_API = "https://api.soundcloud.com";
  private url: string;
  private parseData: string;

  constructor(private clientID: string) {}

  public parseUrl(text: string) {
    const regSC = /(^|\s)(https?:\/\/)?(www\.)?soundcloud\.com(\/[^\s]+)($|\s)/g;
    const match = regSC.exec(text);
    if (!_.isNil(match)) {
      this.parseData = match[4];
      this.url = match[0];
      return this.url;
    }
  }

  public *getTracks() {
    if (_.isNil(this.parseData)) return [];
    const resp = yield requestPromise(`${this.SC_API}/resolve?url=http://soundcloud.com${this.parseData}&client_id=${this.clientID}`);
    if (resp.statusCode !== 200) throw new Error(resp.statusCode);
    let parseBody = JSON.parse(resp.body);
    if (parseBody.kind !== "track" && parseBody.kind !== "playlist") {
      throw new Error('Not a track or a playlist.');
    }
    const tracks: any[] = parseBody.kind === "track" ? [parseBody] : parseBody.tracks;
    return tracks.filter( song => song.kind === 'track' && song.streamable).map( song => {
             const artwork = _.isNil(song.artwork_url) ? 'http://beatmakerleague.com/images/No_Album_Art.png' :
                               song.artwork_url.replace("large", "t500x500");
             return {
               "title"      : song.title,
               "url"        : song.stream_url,
               "poster"     : song.user.username,
               "pic"        : artwork,
               "src"        : "sc"
             };
           }) ;
  }

  public *getUserInfo(user_permalink: string): {} {
    const resp = yield requestPromise(`${this.SC_API}/resolve?url=http://soundcloud.com/${user_permalink}&client_id=${this.clientID}`);
    if (resp.statusCode !== 200) throw new Error(`Code: ${resp.statusCode}`);
    return JSON.parse(resp.body);
  }

  public *downloadFavorites(user_info: SCUser, eventObj?: EventEmitter, event?: string) {
    let next_href = `${this.SC_API}/users/${user_info.id}/favorites?limit=200&linked_partitioning=1&client_id=${this.clientID}`;
    const total = user_info.favorites;
    let list: Track[] = [];
    while (next_href) {
      const resp = yield requestPromise(next_href);
      if (resp.statusCode !== 200) throw new Error(`Download failed: Code ${resp.statusCode}`);
      const data = JSON.parse(resp.body);
      const favs: Track[] = data.collection.filter( data => data.kind === 'track' && data.streamable).map( data => {
                    const artwork = _.isNil(data.artwork_url) ? 'http://beatmakerleague.com/images/No_Album_Art.png' :
                                      data.artwork_url.replace("large", "t500x500");
                    return {
                      "title"      : data.title,
                      "url"        : data.stream_url,
                      "poster"     : data.user.username,
                      "pic"        : artwork,
                      "src"        : "sc"
                    };
                  });
      list = list.concat(favs);
      if (eventObj) {
        const progress = Math.round((list.length / total) * 100);
        eventObj.emit(event, progress);
      }
      next_href = data.next_href;
    }
    user_info.list = list;
    user_info.favorites = list.length;
    return user_info;
  }
}
