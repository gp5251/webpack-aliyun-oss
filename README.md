# webpack-aliyun-oss
A webpack plugin to upload assets to aliyun oss

一个webpack插件，上传资源到阿里云cdn

Install
------------------------
```shell
$ npm i webpack-aliyun-oss -S
```

Options
------------------------

- `from`: 从哪里取文件上传，默认为output.path下所有的文件。支持类似gulp.src的glob方法，如'./build/**', 可以为glob字符串或者数组。
- `dist`: 上传到哪个目录下，默认为根目录。
- `region`: 阿里云上传区域
- `accessKeyId`: 阿里云的授权accessKeyId
- `accessKeySecret`: 阿里云的授权accessKeySecret
- `bucket`: 上传到哪个bucket
- `deletOrigin`: 上传完成是否删除原文件，默认false
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
    deleteOrigin: false,
    setHeaders(filePath) {
      return {
        'Cache-Control': 'max-age=31536000'
      }
    }
  })]
}
```   
