#!/usr/bin/python
import pandas as pd
import os 
import pickle
import sys 
import time


from sklearn.linear_model import LogisticRegression
from sklearn.linear_model import LogisticRegressionCV
from sklearn.neighbors import KNeighborsRegressor
from sklearn.neighbors import KNeighborsClassifier
from sklearn.linear_model import RidgeClassifier
from sklearn.linear_model import RidgeClassifierCV
from sklearn.linear_model import SGDClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.naive_bayes import MultinomialNB
from sklearn.tree import DecisionTreeRegressor
from sklearn.tree import DecisionTreeClassifier
from sklearn.svm import SVC
from sklearn.svm import LinearSVC
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.model_selection import train_test_split

from metrics import Metrics
from config import Config
import argparse
import warnings
warnings.filterwarnings('ignore')
import mysql.connector

class TextClassifierTrain:
	"""
		This is the train phase of the text classifier model we are implementing
		Arguments:
			:param arg1:train csv filename
			:param arg2:input column number
			:param arg3:target column number
			:param arg4:vectorizer model name
			:param arg5:classifier model name
			:type arg1:str
			:type arg2:int
			:type arg3:int
			:type arg4:str
			:type arg5:str
			:returns:vectorizer pickle file
			:returns:classifier pickle file
			:rtype:.pkl
		
	"""	

	def __init__(self,header_id,training_id,csv_file_name,input_col,target_col,model_name,classifier_model):
		self.header_id = ''.join(map(str,header_id))
		self.training_id = ''.join(map(str,training_id))
		self.csv_file_name = ''.join(map(str,csv_file_name))
		self.input_col = input_col
		self.target_col = target_col
		self.model_name = ''.join(map(str,model_name))
		self.classifier_model = ''.join(map(str,classifier_model))
		self.create_model_instance()

	def create_model_instance(self):
		model_invalid = "Invalid model"
		db = mysql.connector.connect(host=Config.HOST_NAME,user=Config.USER,password=Config.PWD,database=Config.SCHEMA)
		df = pd.read_sql("SELECT MODEL_NAME,MODEL_CLASS FROM MLForge_model_tbl",con = db)
		model_name = [x == self.model_name for x in df['MODEL_NAME']]
		model_class = df.loc[model_name, ['MODEL_CLASS']].values[0][0]
		classifier_model = [x == self.classifier_model for x in df['MODEL_NAME']]
		classifier_model_class = df.loc[classifier_model, ['MODEL_CLASS']].values[0][0]

		#creating instance of vectorizer and classifier_model
		if model_class in globals() and classifier_model_class in globals():
			model_class = globals()[model_class]
			self.model_class = model_class()
			classifier_model_class = globals()[classifier_model_class]
			self.classifier_model_class = classifier_model_class()
			self.get_params()
		else:
			return model_invalid


	def get_params(self):
		try:
			df=pd.read_csv(self.csv_file_name)
			df.fillna('',inplace = True)
			inputParams = [df.columns.get_loc(c) for c in self.input_col if c in df]
			targetParams = [df.columns.get_loc(c) for c in self.target_col if c in df]
			X=df.iloc[:,inputParams].values
			y=df.iloc[:,targetParams].values
			self.transform_data(X,y)
		except FileNotFoundError as fne:
			print(fne)


	def transform_data(self,X,y):
		x_train,x_test,y_train,y_test=train_test_split(X,y,test_size=0.2)
		self.vectorised_train_data = self.model_class.fit_transform(x_train.ravel())
		filename = self.get_filename()
		timestampStr = self.get_timestamp()
		self.vectorizerFileName = 'Vectorizer_'+filename+'.pkl'
		self.text_classify(x_test,y_test,y_train)

	def text_classify(self,x_test,y_test,y_train):
		self.classifier_model = self.classifier_model_class.fit(self.vectorised_train_data,y_train)
		filename = self.get_filename()
		timestampStr = self.get_timestamp()
		self.classifierFileName = 'Classifier_'+filename+'.pkl'
		self.get_metrics(x_test,y_test,filename,timestampStr)
		self.pickle_file(self.model_class,self.vectorizerFileName)
		self.pickle_file(self.classifier_model,self.classifierFileName)


	def get_metrics(self,x_test,y_test,filename,timestampStr):
		y_pred_test = self.classifier_model_class.predict(self.model_class.transform(x_test.ravel()))
		fileCode = 'TEXT_CLASSIFIER_TRAIN'
		Metrics(self.header_id,self.training_id,y_test,y_pred_test,self.classifier_model_class,filename,timestampStr,fileCode)


	def get_filename(self):
		#getting filename
		filename_w_ext = os.path.basename(self.csv_file_name)
		filename , ext = os.path.splitext(filename_w_ext)
		self.filename = filename
		return self.filename

	def get_timestamp(self):
		#getting timestamp
		self.timestampStr = time.strftime("%Y%m%d-%H%M%S")
		return self.timestampStr

	def pickle_file(self,model,filename): 
		"""
			The pickle file with latest timestamp is retrieved 
			The file path of downloads location is retrieved 
			Pickle file is dumped into the downloads folder 
		"""
		self.pickleFileName = os.path.join(Config.PICKLE_FOLDER, filename)
		try:
			pickle.dump(model,open(self.pickleFileName, 'wb'))
			print("Succesful pickling of text classifier pickle file")
		except Exception as e:
			print("Error: ", e.__str__())
		except IOError as ioe:
			print(ioe)
		except OSError as ose:
			print(ose)
		except FileNotFoundError as fne:
			print(fne)
		except pickle.PickleError as e:
			print("Not succesful", e)
			print('**********************')
			traceback.print_exc()
			print('**********************')

if __name__ == "__main__":
	parser = argparse.ArgumentParser(description='')
	
	requiredNamed = parser.add_argument_group('required arguments')
	requiredNamed.add_argument('--header_id', type = str, nargs='+',
						help='header id')
	requiredNamed.add_argument('--training_id', type = str, nargs='+',
						help='training id')
	requiredNamed.add_argument('--csv_file_name', type= str, nargs='+',
						help='csv filename')
	requiredNamed.add_argument('--input_col',nargs='+',
						help='input columns for text classifier train phase')
	requiredNamed.add_argument('--target_col',nargs='+',
						help='target column for text classifier train phase')
	requiredNamed.add_argument('--model_name',type= str, nargs='+',
						help='model name for text classifier train phase',required=True)
	requiredNamed.add_argument('--classifier_model',type= str, nargs='+',
						help='classifier model name for train phase',required=True)


	args = parser.parse_args()
	test = TextClassifierTrain(args.header_id,args.training_id,args.csv_file_name,args.input_col,args.target_col,args.model_name,args.classifier_model)


