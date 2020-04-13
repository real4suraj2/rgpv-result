var request = require('request');
var cheerio = require('cheerio');
const express = require("express");
const bodyParser = require("body-parser");
const Tesseract = require('tesseract.js');
const worker = new Tesseract.TesseractWorker();
var resultSheet;
var vs = '';
var vg = '';
var ev = '';
var key = undefined;
var stuData = undefined;
const port = process.env.PORT || 3000;
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader(
		"Access-Control-Allow-Headers",
		"Origin, X-Requested-With, Content-Type, Accept, Authorization"
	);
	res.setHeader(
		"Access-Control-Allow-Methods",
		"GET, POST, PATCH, PUT, DELETE, OPTIONS"
	);
	next();
});
function fetch() {
	return new Promise((resolve,reject)=>{ request({
		url: 'https://rgpv-result-97f7d.firebaseio.com/results.json', method: "GET"
	}, (err, res, body) => {
		resolve(JSON.parse(body));
		//console.log("Data fetched");
	})
	})
}
function pausecomp(millis) {
	var date = new Date();
	var curDate = null;
	do { curDate = new Date(); }
	while (curDate - date < millis);
}
function ocr(img) {
	return new Promise((resolve, reject) => {
		worker.recognize(img)
			.catch(err => reject(err))
			.then(result => {

				var text = result.text.replace(/[^a-zA-Z0-9]/g, "");
				text = text.slice(0, text.length);
				text = text.toUpperCase();
				console.log(text);
				if (text.length != 5)
					reject();
				resolve(text);
			})
	})
}
function setup(){
	return new Promise((resolve,reject)=>{
		request('http://result.rgpv.ac.in/result/programselect.aspx?id=%24%25',(err,res,body)=>{
			 var $ = cheerio.load(body);
			 vs = encodeURIComponent($("input[id='__VIEWSTATE']").val());
			 vg = encodeURIComponent($("input[id='__VIEWSTATEGENERATOR']").val());
			 ev = encodeURIComponent($("input[id='__EVENTVALIDATION']").val());
			if(vs.length>0)
				resolve();
			reject();
		})
	})
	
	
}
function saveData(data){
	var r =data['rollNo'];
	var obj = {};
	obj[r] = data;
	return new Promise((resolve,reject)=>{
		request({
	url:'https://rgpv-result-97f7d.firebaseio.com/results.json',method:"PATCH",body:JSON.stringify(obj)
},(err,res,body)=>{
	console.log(data.rollNo+" added");
	resolve();
	
})
		
		
	})
	
}
var cookie = request.jar();
function result({rollNo,semester},timer) {
	return new Promise((resolve, reject) => {
		
		request({
			url:
`http://result.rgpv.ac.in/result/programselect.aspx?id=%24%25&__EVENTTARGET=radlstProgram%241&__EVENTARGUMENT=&__LASTFOCUS=&__VIEWSTATE=${vs}&__VIEWSTATEGENERATOR=${vg}&__EVENTVALIDATION=${ev}&radlstProgram=24`,
			method: "GET",
			jar: cookie
		}, (err, response, body) => {
			try{
			var $ = cheerio.load(body);
			var rejection = $('h1');
			var viewState = $("input[id='__VIEWSTATE']").val();
			var viewStateGenerator = $("input[id='__VIEWSTATEGENERATOR']").val();
			var eventValidation = $("input[id='__EVENTVALIDATION']").val();
			var image = $("img");
			var img = 'http://result.rgpv.ac.in/result/' + String(image['1'].attribs.src);
			var login = '';
			ocr(img).then((captcha) => {
				login = {
					'__EVENTTARGET': '',
					'__EVENTARGUMENT': '',
					'__VIEWSTATE': viewState,
					'__VIEWSTATEGENERATOR': viewStateGenerator,
					'__EVENTVALIDATION': eventValidation,
					'ctl00$ContentPlaceHolder1$txtrollno': rollNo,
					'ctl00$ContentPlaceHolder1$drpSemester': String(semester),
					'ctl00$ContentPlaceHolder1$rbtnlstSType': 'G',
					'ctl00$ContentPlaceHolder1$TextBox1': captcha,
					'ctl00$ContentPlaceHolder1$btnviewresult': 'View Result'
				};
				pausecomp(timer);
				request({
					url: `http://result.rgpv.ac.in/result/BErslt.aspx`,
					jar: cookie, method: "POST", form: login
				}, (error, response, body) => {
					var $ = cheerio.load(body);
					var data = {
						name: $("span[id='ctl00_ContentPlaceHolder1_lblNameGrading']").text().trim(),
						rollNo: rollNo,
						course: $("span[id='ctl00_ContentPlaceHolder1_lblProgramGrading']").text(),
						result: $("span[id='ctl00_ContentPlaceHolder1_lblResultNewGrading']").text(),
						sgpa: $("span[id='ctl00_ContentPlaceHolder1_lblSGPA']").text(),
						cgpa: $("span[id='ctl00_ContentPlaceHolder1_lblcgpa']").text()
					}
					if (data.name.length > 1) {
						resolve(data);
					}
					reject();
				})
			}).catch(e => reject());
			}catch{
				reject();
			}
		})
	});
}
app.get('/apiGreedy', (req, res) => {
	var rollNo = req.query.rollNo;
	key = req.query.key;
	if(key=="iamadmin")
	{
	fetch().then(data=>{
		resultSheet = data;

	if (resultSheet[rollNo]) {
		res.send({success:true,body:resultSheet[rollNo],tip:"wrong result? try /api route"})
	} else
		res.send({body:{error:"Either servers are down or you entered an invalid enrollment no .Try using /api route"},success:false});
	})
	}
	else
		 res.send("Either servers are down or you entered an invalid enrollment no . ");
});
app.get('/api', (req, res) => {
	var rollNo = req.query.rollNo;
	var semester = req.query.semester;
	 key = req.query.key?req.query.key:'';
	 if(key=="iamadmin")
	 {
		 key = '&key='+key;
	setup().then(() => {
		
		res.redirect('/api2?rollNo='+rollNo+"&semester="+semester+key);
	})
		.catch(()=>{	
		res.send("Either servers are down or you entered an invalid enrollment no . ");
	})
	 }
	 else
		 res.send("Either servers are down OR you entered an invalid enrollment no .  ");
	 });
		
app.get('/api2', (req, res) => {
	var rollNo = req.query.rollNo;
	var semester = req.query.semester;
	if(key=='&key=iamadmin')
	{
	result({rollNo,semester},3000).then((data) => {
		saveData(data).then(()=>{
			res.send({success:true,body:{ data, suggestion: 'Try greedy search from database using /apiGreedy route ' }});
		})
		
	})
		.catch(e=>{
			res.redirect('/api3?rollNo='+rollNo+"&semester="+semester+key);
		//res.send("Either servers are down or you entered an invalid enrollment no . ");
	})
	}else
		res.send("Either servers are down or you entered an invalid enrollment no . ");
		});
app.get('/api4', (req, res) => {
	var rollNo = req.query.rollNo;
	var semester = req.query.semester;
	if(key=='&key=iamadmin')
	{
	result({rollNo,semester},4000).then((data) => {
saveData(data).then(()=>{
			res.send({success:true,body:{ data, suggestion: 'Try greedy search from database using /apiGreedy route ' }});
		})	})
		.catch(e=>{
			//res.redirect('/api?rollNo='+rollNo);
		res.send({body:{error:"Either servers are down or you entered an invalid enrollment no ."},success:false});
	})
	}else
		res.send({body:{error:"Either servers are down or you entered an invalid enrollment no ."},success:false});
		});
app.get('/api3', (req, res) => {
	var rollNo = req.query.rollNo;
	var semester = req.query.semester;
	if(key=='&key=iamadmin'){
	result({rollNo,semester},2000).then((data) => {
saveData(data).then(()=>{
			res.send({success:true,body:{ data, suggestion: 'Try greedy search from database using /apiGreedy route ' }});
		})
		})
		.catch(e=>{
			res.redirect('/api4?rollNo='+rollNo+"&semester="+semester+key);
		//res.send("Either servers are down or you entered an invalid enrollment no . ");
	})
	}
	else
		res.send("Either servers are down or you entered an invalid enrollment no . ");
		});

app.listen(port, () => {
	console.log('Server started on port' + port)
});