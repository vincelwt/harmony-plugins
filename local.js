const dialog = require('electron').remote.dialog;
const md5 = require('md5');
const rimraf = require('rimraf');
const imgFolder = require('electron').remote.app.getPath('userData')+'/Artworks';

class Local {

	/**
	 * Fetch data
	 * @param callback
	 * @returns {Promise}
	 */
	static fetchData (callback) {

		return new Promise((resolve, reject) => {

			data.local = [];
			resetImgFolder();

			if (conf.get("localPlaylistFavs") === undefined) {
				data.local.push({
					title: 'Favorites',
					artwork: '',
					icon: 'heart',
					id: 'favs',
					tracks: []
				});

				conf.set("localPlaylistFavs", data.local[0]);

			} else {
				data.local[0] = conf.get("localPlaylistFavs");
			}

			data.local.push({
				title: 'Library',
				artwork: '',
				icon: 'drive',
				id: 'library',
				tracks: []
			});

			const supportedTypes = ['mp3', "wav", "flac", "ogg", "mp4", "m4a"];

			// Useless 'for' for now, will be useful when multiple folders possible
			//for (let i of settings.local.paths) {

			recursive(settings.local.paths[0], (err, files) => {

				if (files === undefined) {
					settings.local.error = true;
					return reject([err, true])
				}

				let finishNow = false;
				let musicFiles = [];

				for (let file of files) {
					const fileExtension = file.split('.').slice(-1)[0].toLowerCase();;

					if (supportedTypes.includes(fileExtension)) {
						musicFiles.push(file);
					}
				}

				let done = 0;
				musicFiles.forEach(filename => {
					getTrackMetadatas(filename, (track) => {
						done++;

						data.local[1].tracks.push(track);

						if (done == musicFiles.length)  { // When we treated all files
							data.local[1].tracks = data.local[1].tracks.sortBy('artist');
							resolve();
						}

					})
				});
			});
			//}
		});
	}

	/**
	* Called when user wants to activate the service
	*
	* @param callback {Function} Callback function
	*/

	static login (callback) {

		settings.local.paths = dialog.showOpenDialog({
			properties: ['openDirectory']
		});

		if (settings.local.paths == undefined) return callback("No path selected");

		getById("LoggedBtn_local").innerHTML = settings.local.paths;
		callback();

	}

	/**
	 * Like a song
	 */
	static like () {
		this.toggleLike();
	}

	/**
	 * Unlike a song
	 */
	static unlike () {
		this.toggleLike();
	}

	/**
	 * Toggle the like status on a local song
	 */
	static toggleLike () {
		conf.set("localPlaylistFavs", data.local.playlists[0]);
	}

	/**
	 * Get the streamable URL
	 *
	 * @param track {Object} The track object
	 * @param callback {Function} The callback function
	 */
	static getStreamUrl (track, callback) {
		callback(track.stream_url, track.id);
	}

	/**
	 * View the artist
	 *
	 * @param track {Object} The track object
	 */
	static viewArtist (track) {
		let tracks = [];

		for (let pl of data.local)
			if (pl.id == 'library')
				for (let tr of pl.tracks)
					if (tr.artist.id == track.artist.id)
						tracks.push(tr);

		specialView('local', tracks, 'artist', track.artist.name);
	}

	/**
	 * View the album
	 *
	 * @param track {Object} The track object
	 */
	static viewAlbum (track) {
		let tracks = [];

		for (let pl of data.local)
			if (pl.id == 'library')
				for (let tr of pl.tracks)
					if (tr.album.id == track.album.id)
						tracks.push(tr);

		specialView('local', tracks, 'album', track.album.name, track.artwork);
	}

	/**
	 * Search
	 * @param query {String}: the query of the search
	 * @param callback
	 */
	static searchTracks (query, callback) {
		let tracks = [];

		for (let pl of data.local)
			if (pl.id == 'library')
				for (let tr of pl.tracks)
					if (isSearched(tr, query))
						tracks.push(tr);

		callback(tracks)
	}

}

/** Static Properties **/
Local.fullName = "Local files";
Local.favsLocation = "local,favs";
Local.scrobbling = true;
Local.color = "#666666";
Local.settings = {
	paths: [],
	active: false
};

Local.contextmenuItems = [

	{
		title: 'View artist',
		fn: () => Local.viewArtist(trackList[index])
	},

	{
		title: 'View album',
		fn: () => Local.viewAlbum(trackList[index])
	},

];

Local.loginBtnHtml = `

	<a id='Btn_local' class='button login local hide' onclick="login('local')">Listen with <b>local tracks</b></a>
	<a id='LoggedBtn_local' class='button login local hide' onclick="login('local')"></a>
	<span id='error_local' class='error hide'>Error with your path</span>

`;

Local.loginBtnCss = `
	.local {
	  background-color: #6894B4;
	  background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4AIHDgkRjGtsSgAAAsxJREFUeNrt3b1qFGEUh/HnBIUUmhRGDVY2Noo24gVoI96EoMQ2nb2VhVhEwUYQrC1MIzYWXoBgJVGLEOz8wCQm8StxcyyyfdB9Z2eG9/lVqRZmz3/POTOzmwFJkiRJkiRJkiRJkiRJkiRJkvaXmZGZE028ru/u/5touOjnM/NlZm4Au8AgCwN2h38OMnMzM99n5kJmTlne/UWDxZ8EVoDZlo7tFXApIrYsczsd4GKLxQe4ADzJzAOWuZ0AnO3A8V0BHrontBOAEx05xmvAgqUefwBmO3Sc85l5z04w3gAc79ixzg93gmnLPp6zgDfAmQ4e80fgAfACWAY2gJ2ISANQNgBfgBk/YyPZBt4BtyJisTcBGJ56bTcZsMrsAKci4kNfdoAZi1/UQeByn5bAY9asuJMGoG5TBqBuh/oUgOPWq+4A2AEMgAo73KcAHLVe7gCqOABeAu5JACRJUp2K3LHLzBvAHHDaZaVxP9j7uv1T4HZE/Go1AJl5E7hjXVrxKCLm2g7ACg3dqtS+ViPiSNsB2MUvf7RlEBEj/fClxIWggXVozcg/eysRgFXr0Jo1A1C3dQNgBzAABsAAOAIMgB2grQB8tQ6OADkCZAeQAZAjQJ4FqC8BKPWNoB3A/8c3fpMR8bvtDlBkFumf/Ry1+CUD4B7Qw/ZvACo/AygZABdBO4AMgKodAQbADqCaA+AS6AiQI0AGQI4AVdgB1tl7LqBqDMDwaRtr1qTeEeAYGK8/EbFpAPz0GwADYABcADsSAC8HVx4AO4AjQHYAGQA5AuRZgBwBqmoEeEew5g4QEbvAN2tT7whwDFQ+AlwExyMNQN02I2LQ1QB8tj6N+1TyxUoHYMn6NO5tlwPwzPo07nlnAxARS8B9a9SY18DjojVrZE3NvApcB84B0zT3jOIafAeWgUXgbkRs+ZZIkiRJkiRJkiRJkiRJkiRJkiSAv7ZLOmGgbupvAAAAAElFTkSuQmCC);
	}
`;

/** 
Get the metadatas of a disk file
@param filename: the path of the file
@param callback: function to call when over
**/

const getTrackMetadatas = (filename, callback) => {

	const fileStream = fs.createReadStream(filename);
	
	const parser = new mm(fileStream, { duration: true }, (err, metadata) => {

		fileStream.destroy(); // Without that everything is stored in ram

		const id = new Buffer(filename).toString('base64'); // We generate array from base64 code


		getArtworkPath(metadata, artwork => {

			let tempTrack;

			if (err || metadata.title === "" || metadata.title === undefined) {
				// No metadata were found

				let title = (process.platform == "win32" ? filename.split("\\").pop() : filename.split('/').pop());

				tempTrack = {
					'service': 'local',
					'title': title,
					'share_url': `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`,
					'artist': {
						'name': '',
						'id': ''
					},
					'album': {
						'name': '',
						'id': ''
					},
					'trackNumber': '',
					'id': id,
					'duration': metadata.duration * 1000,
					'artwork': artwork,
					'stream_url': `file://${filename}`
				};

			} else {
				metadata.album = metadata.album || '';
				metadata.artist[0] = metadata.artist[0] || '';
				const ytLookup = metadata.artist[0] + " " + metadata.title;

				tempTrack = {
					'service': 'local',
					'title': metadata.title,
					'share_url': `https://www.youtube.com/results?search_query=${encodeURIComponent(ytLookup)}`,
					'artist': {
						'name': metadata.artist[0],
						'id': metadata.artist[0]
					},
					'trackNumber': metadata.track.no,
					'album': {
						'name': metadata.album,
						'id': metadata.album
					},
					'id': id,
					'duration': metadata.duration * 1000,
					'artwork': artwork,
					'stream_url': `file://${filename}`
				};
			}

			if (tempTrack.duration === 0) {
				getAudioDuration(tempTrack.stream_url, duration => {
					tempTrack.duration = duration;
					callback(tempTrack);
				});
			} else {
				callback(tempTrack)
			}
			
		});
	});
}

const getArtworkPath = (metadata, callback)  => {
	if (metadata.picture.length < 1) return callback('');

	let picture = metadata.picture[0];
	let artwork = URL.createObjectURL(new Blob([picture.data], { 'type': 'image/' + picture.format}));

	var reader = new window.FileReader();
	reader.readAsDataURL(new Blob([picture.data])); 
	reader.onloadend = function() {
		rawImage = reader.result;
		let base64Data = rawImage.replace("data:;base64,", "");
		const imgPath = imgFolder+"/"+md5(rawImage)+'.'+picture.format;

		require("fs").writeFile(imgPath, base64Data, 'base64', function(err) {
		  if (err) console.error(err);

		  callback(imgPath);

		});
	}
}

const resetImgFolder = () => {
	
		if( fs.existsSync(imgFolder) ) {

			fs.readdirSync(imgFolder).forEach(function(file,index) {
				let curPath = imgFolder + "/" + file;
				if(fs.lstatSync(curPath).isDirectory()) { // recurse
					deleteFolderRecursive(curPath);
				} else { // delete file
					fs.unlinkSync(curPath);
				}
			});
			fs.rmdirSync(imgFolder);
		}
		fs.mkdirSync(imgFolder);

}

/** 
Get the duration of an audio track, used when the metadata parsing for the duratio  failed.
@param path: the path of the file
@param callback: function to call when over
**/
const getAudioDuration = (path, callback) => {
	const audio = new Audio;

	audio.addEventListener('loadedmetadata', () => {
		callback(audio.duration*1000);
	});

	audio.addEventListener('error', e => {
		console.warn('Could not get duration from '+path);
		callback(0);
	});

	audio.preload = 'metadata';
	audio.src = path;
};

module.exports = Local;