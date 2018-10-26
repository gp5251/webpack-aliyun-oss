# webpack-aliyun-oss
A webpack(>=4) plugin to upload assets to aliyun oss

一个webpack4插件，上传资源到阿里云cdn

- 默认按output.path (webpack.config.js) 里的文件路径上传到oss，需要指定上传根目录(dist)。
- 也可以通过`setOssPath`来配置不同的上传路径。

Install
------------------------
```shell
$ npm i webpack-aliyun-oss -S
```

Options
------------------------

- `from`: 上传哪些文件，默认为output.path下所有的文件。支持类似gulp.src的glob方法，如'./build/**', 可以为glob字符串或者数组。
- `dist`: 上传到oss哪个目录下，默认为根目录。
- `region`: 阿里云上传区域
- `accessKeyId`: 阿里云的授权accessKeyId
- `accessKeySecret`: 阿里云的授权accessKeySecret
- `bucket`: 上传到哪个bucket
- `timeout`: oss超时设置，默认为30秒(30000)
- `verbose`: 是否显示上传日志，默认为true
- `deletOrigin`: 上传完成是否删除原文件，默认false
- `deleteEmptyDir`: 如果某个目录下的文件都上传到cdn了，是否删除此目录。deleteOrigin为true时候生效。默认false。
- `setOssPath`: 自定义上传路径
- `setHeaders`: 配置headers

Example
------------------------

```javascript
const WebpackAliyunOss = require('webpack-aliyun-oss')
const webpackConfig = {
  // ... 省略其他
  plugins: [new WebpackAliyunOss({
    from: ['./build/**', '!./build/**/*.html'],
    dist: 'path/in/alioss',
    region: 'your region',
    accessKeyId: 'your key',
    accessKeySecret: 'your secret',
    bucket: 'your bucket',
    setOssPath(filePath) {
      // some operations to filePath
      return '/new/path/flie.js';
    },
    setHeaders(filePath) {
      // some operations to filePath
      return {
        'Cache-Control': 'max-age=31536000'
      }
    }
  })]
}
```   