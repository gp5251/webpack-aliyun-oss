const WebpackAliyunOss = require('../');
const fs = require('fs-extra')
const path = require('path')
const webpack = require('webpack');

describe('webpack-aliyun-oss', () => {
	const context = path.resolve(__dirname);
	process.chdir(context);

	beforeAll(()=>{
		fs.copySync('./_dist', './dist');
	});

	afterAll(()=>{
		fs.remove('./dist');
	});

	it('should normalize url', () => {
		const wpa = createWpaInstance();
		const re = wpa.normalize('http://a.com//b///c')
		expect(re).toBe('http://a.com/b/c')
	});

	it('can upload files widthout webpack', async () => {
		const wpa = createWpaInstance({
			from: ['./dist/**', '!./dist/*.html'], 
			buildRoot: './dist'
		}, false);
		await wpa.doWidthoutWebpack();
		expect(wpa.filesUploaded.length).toBe(3);
	});

	it('can handle error widthout webpack', async () => {
		const wpa = createWpaInstance({
			from: ['./dist/**', '!./dist/*.html'],
			buildRoot: './dist',
			accessKeyId: 'xxx'
		}, false);
		try {
			await wpa.doWidthoutWebpack()
		} catch (e) {
			expect(wpa.filesErrors.length).toBeGreaterThan(1);
		}
	});

	it('can stop uploading when encountered an error', async () => {
		const wpa = createWpaInstance({
			from: ['./dist/**', '!./dist/*.html'],
			buildRoot: './dist',
			accessKeyId: 'xxx',
			bail: true
		}, false);

		try {
			await wpa.doWidthoutWebpack();
		} catch (e) {
			expect(wpa.filesErrors.length).toBe(1);
		}
	});

	it('can upload files in webpack', async () => {
		const wpa = createWpaInstance({
			from: ['./dist/**', '!./dist/*.(html|txt)']
		}, false);

		const re = await runWebapck({
			mode: 'production',
			entry: './webpack/index.js',
			output: {
				path: path.resolve(__dirname, './dist')
			},
			plugins: [wpa]
		})
		expect(re).toBe('done');
	});

	it('can ignore files already exists', async () => {
		const wpa = createWpaInstance({
			from: ['./dist/**', '!./dist/*.html'],
			buildRoot: './dist',
			overwrite: false
		}, false);
		await wpa.doWidthoutWebpack();
		await wpa.doWidthoutWebpack();
		expect(wpa.filesUploaded.length).toBe(0);
	});
});

function createWpaInstance(params = {}, test = true) {
	const oss = require('./oss.config.js')
	let config = {
		from: './dist/**',
		dist: '/temp',
		region: 'your region',
		accessKeyId: 'your key',
		accessKeySecret: 'your secret',
		bucket: 'your bucket',
		overwrite: true,
		test
	};

	return new WebpackAliyunOss(Object.assign(config, oss, params))
}

function runWebapck(config) {
	return new Promise((resolve, reject) => {
		webpack(config, (err, stats) => {
			if (err) {
				console.error('err', err);
				reject(err)
			} else {
				const info = stats.toJson();

				if (stats.hasErrors()) {
					console.error('error', JSON.stringify(info.errors, null, 2));
					reject(info.errors)
				}else {
					resolve('done')
				}
			}
		})
	})
}
