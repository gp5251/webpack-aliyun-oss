const WebpackAliyunOss = require('../');
const fs = require('fs-extra')
const path = require('path')

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

	it('should upload files', async () => {
		const wpa = createWpaInstance({
			from: ['./dist/**', '!./dist/*.html'], 
			buildRoot: './dist'
		});
		const p = await wpa.doWidthoutWebpack();
		console.log(p);
		expect(p.length).toBe(3);
	});
});

function createWpaInstance(params = {}, test = true) {
	let config = {
		from: './dist/**',
		dist: '/temp/webpack-aliyun-oss',
		region: 'your region',
		accessKeyId: 'your key',
		accessKeySecret: 'your secret',
		bucket: 'your bucket',
		test
	};

	return new WebpackAliyunOss(Object.assign(config, params))
}
