# webpack-aliyun-oss
A webpack(version>=4) plugin to upload assets to aliyun oss, u can use it with or without webpack.

一个webpack(version>=4)插件，上传资源到阿里云oss。可以作为webpack插件使用，也可独立使用

- 以插件方式使用时，默认按output.path (webpack.config.js) 目录下的文件路径上传(保留原文件路径的层级结构)。
- 独立使用时，按`buildRoot`的文件路径上传(保留原文件路径的层级结构)。
- 以上两种方式，都可以通过`setOssPath`重新配置不同的上传路径。

Install
------------------------
```shell
$ npm i webpack-aliyun-oss -D
```

Options
------------------------

- `from`: 上传哪些文件，支持glob方式，如'./build/**', 可以为glob字符串或者数组。
  - 作为插件使用时：可选。默认为output.path下所有的文件。
  - 独立使用时：必传
- `dist`: 上传到oss哪个目录下，默认为oss根目录。可作为路径前缀使用。
- `ossOptions`: OSS相关参数配置。
  - `region`: 阿里云上传区域
  - `accessKeyId`: 阿里云的授权accessKeyId
  - `accessKeySecret`: 阿里云的授权accessKeySecret
  - `bucket`: 上传到哪个bucket
  - `stsToken`: security-token, 可选
  - 以及oss其他可能的参数都可以在这里配置
- `timeout`: oss超时设置，默认为30秒(30000)
- `overwrite`: 是否覆盖oss同名文件。默认false
- `parallel`: 并发上传个数。默认5
- `deleteOrigin`: 上传完成是否删除原文件，默认false
- `setOssPath`: 自定义每个文件上传路径。接收参数为当前文件路径。不传，或者所传函数返回false则按默认方式上传。
- `setHeaders`: 配置headers的函数。接收参数为当前文件路径。不传，或者所传函数返回false则不设置header。
- `buildRoot`: 构建目录。如：path/to/your/files。独立使用时候需要传。如果已传`setOssPath`可忽略。默认为当前工作目录。
- `test`: 测试，仅查看文件和上传路径，但是不执行上传操作。默认false
- `bail`: 出错是否中断上传。默认false
- `logToLocal`: 出错信息写入本地upload.error.log。默认false

#### 注意: `accessKeyId, accessKeySecret` 很重要，注意保密!!!

Example
------------------------

##### 作为webpack插件使用
```javascript
const WebpackAliyunOss = require('webpack-aliyun-oss');
const webpackConfig = {
  // ... 省略其他
  plugins: [new WebpackAliyunOss({
    from: ['./build/**', '!./build/**/*.html'], // build目录下除html之外的所有文件
    dist: '/path/in/alioss', // oss上传目录
    region: 'your region',
    accessKeyId: 'your key',
    accessKeySecret: 'your secret',
    bucket: 'your bucket',
    stsToken: '<security-token>', // 可选

    // 如果希望自定义上传路径，就传这个函数
    // 否则按 output.path (webpack.config.js) 目录下的文件路径上传
    setOssPath(filePath) {
      // filePath为当前文件路径。函数应该返回路径+文件名。
      // 如果返回/new/path/to/file.js，则最终上传路径为 /path/in/alioss/new/path/to/file.js
      return '/new/path/to/file.js';
    },

    // 如果想定义header就传
    setHeaders(filePath) {
      // 定义当前文件header，可选
      return {
        'Cache-Control': 'max-age=31536000'
      }
    }
  })]
}
```

##### 独立使用

```javascript
const WebpackAliyunOss = require('webpack-aliyun-oss');
new WebpackAliyunOss({
    from: ['./build/**', '!./build/**/*.html'],
    dist: '/path/in/alioss',
    buildRoot: 'build', // 构建目录，如果已传setOssPath，可忽略
    region: 'your region',
    accessKeyId: 'your key',
    accessKeySecret: 'your secret',
    bucket: 'your bucket',
    stsToken: '<security-token>', // 可选

    // 如果希望自定义上传路径，就传这个函数
    // 否则按`buildRoot`下的文件结构上传
    setOssPath(filePath) {
      // filePath为当前文件路径。函数应该返回路径+文件名。
      // 如果返回/new/path/to/file.js，则最终上传路径为 /path/in/alioss/new/path/to/file.js
      return '/new/path/to/file.js';
    },

    // 如果想定义header就传
    setHeaders(filePath) {
      return {
        'Cache-Control': 'max-age=31536000'
      }
    }
}).apply(); 
```   
